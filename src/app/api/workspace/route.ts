import { NextRequest, NextResponse, after } from "next/server";
import { startCalendarJobs } from "@/lib/calendar/jobs";
import { currentActor } from "@/lib/current-actor";
import {
  executeCommand,
  loadWorkspace,
  loadTaskPage,
  taskDiscussion,
} from "@/lib/service";
import { checkMutationOrigin } from "@/lib/permissions";
import { purgeEntityAttachments } from "@/lib/attachments";
import { z } from "zod";
import { requestJson, apiFailure } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET(req: NextRequest) {
  try {
    const actor = await currentActor();
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (taskId)
      return response(await taskDiscussion(z.string().uuid().parse(taskId)));
    const cursor = req.nextUrl.searchParams.get("cursor");
    if (cursor)
      return response(await loadTaskPage(z.string().uuid().parse(cursor)));
    return response(await loadWorkspace(actor));
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    checkMutationOrigin(
      req.headers.get("origin"),
      process.env.BETTER_AUTH_URL || req.nextUrl.origin,
    );
    const input = await requestJson(req, 2000000);
    const actor = await currentActor();
    const result = await executeCommand(actor, input);
    if (result.deletedTaskId || result.deletedProjectId)
      after(async () => {
        try {
          await purgeEntityAttachments(
            result.deletedTaskId ? "task" : "project",
            (result.deletedTaskId || result.deletedProjectId)!,
          );
        } catch {
          console.error("Deleted entity attachment cleanup pending");
        }
      });
    after(async () => {
      try {
        await startCalendarJobs();
      } catch {
        console.error("Calendar queue dispatch pending");
      }
    });
    return response(result);
  } catch (e) {
    return apiFailure(e);
  }
}
