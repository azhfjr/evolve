import { after, NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import {
  cleanupAttachments,
  listAttachments,
  reserveAttachment,
  ownedReservation,
} from "@/lib/attachments";
import { r2UploadPermission } from "@/lib/r2-storage";
import { requireHealthyR2 } from "@/lib/r2-reconciliation";
import { database } from "@/lib/db";
import { AppError } from "@/lib/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const actor = await currentActor();
    const type = z
      .enum([
        "task",
        "taskDraft",
        "project",
        "boardRoomProject",
        "avatar",
        "workspace",
      ])
      .parse(request.nextUrl.searchParams.get("entityType"));
    const id = z
      .string()
      .min(1)
      .parse(request.nextUrl.searchParams.get("entityId"));
    return privateJson({ attachments: await listAttachments(actor, type, id) });
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    // Cleanup must not delay the upload handshake or run for anonymous requests.
    // after() also runs if quota validation rejects this reservation.
    after(async () => {
      try {
        await cleanupAttachments();
      } catch (error) {
        console.error(
          "Attachment background cleanup failed",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    });
    const reservation = await reserveAttachment(
      actor,
      await requestJson(request, 4096),
    );
    if (reservation.provider !== "r2" || reservation.file)
      return privateJson(reservation);
    if (process.env.EVOLVE_STORAGE_WRITE_MODE === "paused")
      throw new AppError("Document uploads are paused.", 503);
    const item = await ownedReservation(actor, reservation.id);
    if (item.state !== "pending")
      throw new AppError("Upload reservation changed. Try again.", 409);
    await requireHealthyR2((await database()).db);
    return privateJson({
      ...reservation,
      upload: await r2UploadPermission(item),
    });
  } catch (e) {
    return apiFailure(e);
  }
}
