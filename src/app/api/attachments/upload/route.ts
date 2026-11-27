import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import { ownedReservation } from "@/lib/attachments";
import { attachmentProvider } from "@/lib/storage-config";
import { AppError } from "@/lib/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (
      !process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.EVOLVE_STORAGE_WRITE_MODE === "paused"
    )
      throw new AppError("Penyimpanan Blob belum tersedia.", 503);
    const body = (await requestJson(request, 10000)) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, payload) => {
        const actor = await mutationActor(request);
        let id: string;
        try {
          id = z.object({ id: z.uuid() }).parse(JSON.parse(payload || "{}")).id;
        } catch {
          throw new AppError("Izin unggah tidak valid.", 400);
        }
        const item = await ownedReservation(actor, id);
        if (
          attachmentProvider(item) !== "blob" ||
          item.state !== "pending" ||
          pathname !== item.storagePath
        )
          throw new AppError("Lokasi unggahan tidak diizinkan.", 403);
        return {
          allowedContentTypes: [item.contentType],
          maximumSizeInBytes: item.size,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 600000,
        };
      },
    });
    return privateJson(result);
  } catch (e) {
    return apiFailure(e);
  }
}
