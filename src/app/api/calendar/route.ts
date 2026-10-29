import { NextResponse, after } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import {
  calendarPreferenceSchema,
  calendarStatus,
  disconnectCalendar,
  queueAllCalendarTasks,
  startCalendarConnection,
  updateCalendarSettings,
} from "@/lib/calendar/service";
import { startCalendarJobs } from "@/lib/calendar/jobs";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("connect"), taskId: z.uuid().optional() })
    .strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z.object({ action: z.literal("retry") }).strict(),
  calendarPreferenceSchema
    .extend({
      action: z.literal("settings"),
      version: z.number().int().positive(),
    })
    .strict(),
]);
export async function GET() {
  try {
    return privateJson(await calendarStatus(await currentActor()));
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    const input = schema.parse(await requestJson(request, 4096));
    if (input.action === "connect") {
      const result = await startCalendarConnection(actor, input.taskId);
      const response = NextResponse.json(
        { url: result.url },
        { headers: { "Cache-Control": "private, no-store" } },
      );
      response.cookies.set("evolve_calendar_oauth", result.state, {
        httpOnly: true,
        secure: process.env.BETTER_AUTH_URL?.startsWith("https://"),
        sameSite: "lax",
        path: "/api/calendar",
        maxAge: 600,
      });
      return response;
    }
    if (input.action === "disconnect") await disconnectCalendar(actor);
    if (input.action === "settings") {
      const { action: _, ...fields } = input;
      void _;
      await updateCalendarSettings(actor, fields);
    }
    if (input.action === "retry") {
      const { db } = await database();
      await queueAllCalendarTasks(db, actor.email);
    }
    after(async () => {
      try {
        await startCalendarJobs({ email: actor.email });
      } catch {
        console.error("Calendar queue dispatch deferred");
      }
    });
    return privateJson(await calendarStatus(actor));
  } catch (e) {
    return apiFailure(e);
  }
}
