import { after } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import { taskCalendarStatus, setTaskCalendar } from "@/lib/calendar/service";
import { startCalendarJobs } from "@/lib/calendar/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return privateJson(
      await taskCalendarStatus(await currentActor(), (await params).id),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await mutationActor(request);
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await requestJson(request, 1024));
    const taskId = (await params).id;
    const result = await setTaskCalendar(actor, taskId, enabled);
    after(async () => {
      try {
        await startCalendarJobs({ email: actor.email, taskId });
      } catch {
        console.error("Calendar dispatch pending");
      }
    });
    return privateJson(result);
  } catch (error) {
    return apiFailure(error);
  }
}
