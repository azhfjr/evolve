import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { findTask } from "@/lib/task-query";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: RouteContext<"/api/tasks/[id]">,
) {
  try {
    await currentActor();
    return privateJson({ task: await findTask((await context.params).id) });
  } catch (e) {
    return apiFailure(e);
  }
}
