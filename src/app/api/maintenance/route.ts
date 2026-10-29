import { randomUUID, timingSafeEqual } from "node:crypto";
import { startCalendarJobs } from "@/lib/calendar/jobs";
import { cleanupAttachments } from "@/lib/attachments";
import { privateJson, apiFailure } from "@/lib/http";
import { recordMaintenance } from "@/lib/operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return privateJson({ error: "Maintenance not configured" }, 503);
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(request.headers.get("authorization") || "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return privateJson({ error: "Unauthorized" }, 401);
  const runId = randomUUID();
  await recordMaintenance("start", runId);
  try {
    await cleanupAttachments();
    await startCalendarJobs();
    await recordMaintenance("complete", runId);
    return privateJson({ ok: true });
  } catch (error) {
    await recordMaintenance("fail", runId);
    return apiFailure(error);
  }
}
