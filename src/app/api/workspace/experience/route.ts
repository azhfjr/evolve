import { after } from "next/server";
import { startCalendarJobs } from "@/lib/calendar/jobs";
import { currentActor } from "@/lib/current-actor";
import { loadWorkspaceHome } from "@/lib/workspace-experience";
import { executeCommand } from "@/lib/service";
import { commandSchema } from "@/lib/validation";
import { AppError } from "@/lib/permissions";
import {
  apiFailure,
  privateJson,
  mutationActor,
  requestJson,
} from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    return privateJson(await loadWorkspaceHome(await currentActor()));
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    const command = commandSchema.parse(await requestJson(request));
    if (
      command.action !== "updateProfile" &&
      command.action !== "updateWorkspace"
    )
      throw new AppError(
        "Only shared workspace settings can be changed here.",
        400,
      );
    const result = await executeCommand(actor, command);
    after(async () => {
      try {
        await startCalendarJobs();
      } catch {
        console.error("Calendar queue dispatch pending");
      }
    });
    return privateJson(result);
  } catch (error) {
    return apiFailure(error);
  }
}
