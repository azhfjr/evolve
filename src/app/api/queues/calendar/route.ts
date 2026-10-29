import { QueueClient } from "@vercel/queue";
import { processCalendarJobs, dispatchCalendarJobs } from "@/lib/calendar/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
const queue = new QueueClient({ region: "sin1" });
export const POST = queue.handleCallback(
  async () => {
    await processCalendarJobs(1);
    await dispatchCalendarJobs();
  },
  { visibilityTimeoutSeconds: 90 },
);
