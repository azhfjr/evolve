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
} from "@/lib/attachments";
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
    return privateJson(
      await reserveAttachment(actor, await requestJson(request, 4096)),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
