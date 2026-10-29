import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import { processCalendarJobs } from "../src/lib/calendar/jobs";
async function main() {
  if (process.env.EVOLVE_CALENDAR_RECOVERY !== "1")
    throw new Error(
      "Set EVOLVE_CALENDAR_RECOVERY=1 for a controlled recovery of existing queued Calendar work.",
    );
  const { db, close } = await database();
  try {
    const processed = await processCalendarJobs(5);
    const remaining = await db.execute(
      sql`SELECT count(*)::int AS pending,count(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed FROM calendar_job`,
    );
    console.log(
      JSON.stringify({ calendarRecovery: { processed, ...remaining.rows[0] } }),
    );
    if (process.env.VERCEL) {
      const { QueueClient } = await import("@vercel/queue");
      const queue = new QueueClient({ region: "sin1" });
      await queue.send("evolve-calendar", { kind: "drain" });
      console.log(
        JSON.stringify({ calendarQueueWake: "accepted", region: "sin1" }),
      );
    }
  } finally {
    await close();
  }
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      calendarRecovery: "incomplete",
      errorType: error instanceof Error ? error.name : "Unknown",
      queuedWork: "preserved",
    }),
  );
  process.exitCode = 1;
});
