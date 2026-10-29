import { NextRequest, NextResponse, after } from "next/server";
import { currentActor } from "@/lib/current-actor";
import { finishCalendarConnection } from "@/lib/calendar/service";
import { startCalendarJobs } from "@/lib/calendar/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const destination = new URL(
    "/app?section=settings&tab=calendar",
    process.env.BETTER_AUTH_URL || request.nextUrl.origin,
  );
  try {
    if (request.nextUrl.searchParams.has("error"))
      throw new Error("CalendarConsentDenied");
    const actor = await currentActor();
    const returnTaskId = await finishCalendarConnection(
      actor,
      request.nextUrl.searchParams.get("state") || "",
      request.cookies.get("evolve_calendar_oauth")?.value || "",
      request.nextUrl.searchParams.get("code") || "",
    );
    if (returnTaskId) {
      destination.searchParams.delete("section");
      destination.searchParams.delete("tab");
      destination.searchParams.set("task", returnTaskId);
    }
    destination.searchParams.set("calendar", "connected");
    after(async () => {
      try {
        await startCalendarJobs({ email: actor.email });
      } catch {
        console.error("Calendar dispatch pending");
      }
    });
  } catch {
    destination.searchParams.set("calendar", "failed");
  }
  const response = NextResponse.redirect(destination);
  response.cookies.set("evolve_calendar_oauth", "", {
    path: "/api/calendar",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
