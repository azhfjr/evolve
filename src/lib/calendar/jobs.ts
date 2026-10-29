import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import * as s from "../db/schema";
import {
  CalendarError,
  calendarEventBody,
  decryptCalendarToken,
  encryptCalendarToken,
  googleEventId,
  googleJson,
} from "./google";
type Job = {
  email: string;
  task_id: string;
  generation: number;
  attempts: number;
  lease_until: Date;
};
async function syncJob(job: Job) {
  const { db } = await database();
  if (
    (
      await db.execute(
        sql`SELECT 1 FROM legacy_record WHERE kind='task' AND id=${job.task_id}`,
      )
    ).rows.length
  )
    return;
  let [connection] = await db
    .select()
    .from(s.calendarConnection)
    .where(
      and(
        eq(s.calendarConnection.email, job.email),
        eq(s.calendarConnection.enabled, true),
      ),
    );
  const [member] = await db
    .select()
    .from(s.member)
    .where(and(eq(s.member.email, job.email), eq(s.member.disabled, false)));
  if (!connection || !member) return;
  const [task] = await db
    .select()
    .from(s.task)
    .where(eq(s.task.id, job.task_id));
  let token = decryptCalendarToken(connection.accessToken, job.email);
  if (+connection.expiresAt < Date.now() + 60000) {
    const result = await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: decryptCalendarToken(connection.refreshToken, job.email),
      }),
    });
    const refreshed = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().int().min(1).max(86400),
      })
      .parse(result.data);
    token = refreshed.access_token;
    const [updated] = await db
      .update(s.calendarConnection)
      .set({
        accessToken: encryptCalendarToken(token, job.email),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      })
      .where(
        and(
          eq(s.calendarConnection.email, job.email),
          eq(s.calendarConnection.version, connection.version),
        ),
      )
      .returning();
    if (!updated) return;
    connection = updated;
  }
  const [preference] = await db
    .select()
    .from(s.calendarTaskPreference)
    .where(
      and(
        eq(s.calendarTaskPreference.email, job.email),
        eq(s.calendarTaskPreference.taskId, job.task_id),
      ),
    );
  if (connection.timeZone !== member.timeZone) {
    await googleJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeZone: member.timeZone }),
      },
    );
    await db
      .update(s.calendarConnection)
      .set({ timeZone: member.timeZone })
      .where(
        and(
          eq(s.calendarConnection.email, job.email),
          eq(s.calendarConnection.version, connection.version),
        ),
      );
  }
  const eventId = googleEventId(job.email, job.task_id);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const eligible =
    task &&
    !task.archived &&
    task.status !== "done" &&
    task.dueDate &&
    (preference?.enabled ??
      (connection.syncScope === "all" || task.assignee === job.email));
  if (eligible) {
    const body = JSON.stringify({
      ...calendarEventBody(
        task,
        member.timeZone,
        connection.reminders,
        process.env.BETTER_AUTH_URL!,
      ),
      id: eventId,
    });
    const result = await googleJson(
      `${url}/${eventId}?sendUpdates=none`,
      { method: "PUT", headers, body },
      [404, 410],
    );
    if (result.status === 404 || result.status === 410) {
      const created = await googleJson(
        `${url}?sendUpdates=none`,
        { method: "POST", headers, body },
        [409],
      );
      if (created.status === 409)
        await googleJson(`${url}/${eventId}?sendUpdates=none`, {
          method: "PUT",
          headers,
          body,
        });
    }
    const [stillConnected] = await db
      .select()
      .from(s.calendarConnection)
      .where(
        and(
          eq(s.calendarConnection.email, job.email),
          eq(s.calendarConnection.version, connection.version),
          eq(s.calendarConnection.enabled, true),
        ),
      );
    if (stillConnected)
      await db
        .insert(s.calendarEvent)
        .values({
          email: job.email,
          taskId: task.id,
          eventId,
          syncedVersion: task.version,
        })
        .onConflictDoUpdate({
          target: [s.calendarEvent.email, s.calendarEvent.taskId],
          set: { eventId, syncedVersion: task.version, syncedAt: new Date() },
        });
  } else {
    await googleJson(
      `${url}/${eventId}?sendUpdates=none`,
      { method: "DELETE", headers },
      [404, 410, 204],
    );
    await db
      .delete(s.calendarEvent)
      .where(
        and(
          eq(s.calendarEvent.email, job.email),
          eq(s.calendarEvent.taskId, job.task_id),
        ),
      );
  }
  await db
    .update(s.calendarConnection)
    .set({ errorCode: null, updatedAt: new Date() })
    .where(
      and(
        eq(s.calendarConnection.email, job.email),
        eq(s.calendarConnection.version, connection.version),
      ),
    );
}
export type CalendarJobScope = { email: string; taskId?: string };
export async function processCalendarJobs(limit = 1, scope?: CalendarJobScope) {
  const { db } = await database();
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const result = await db.execute(
      sql`UPDATE calendar_job SET lease_until=now()+interval '90 seconds' WHERE (email,task_id) IN (SELECT j.email,j.task_id FROM calendar_job j JOIN calendar_connection c ON c.email=j.email JOIN member m ON m.email=j.email WHERE c.enabled AND NOT m.disabled AND ${scope ? sql`j.email=${scope.email}` : sql`true`} AND ${scope?.taskId ? sql`j.task_id=${scope.taskId}` : sql`true`} AND coalesce((SELECT (w.configuration->>'calendarEnabled')::boolean FROM workspace_setting w WHERE w.id='primary'),true) AND coalesce(c.error_code,'')<>'reconnect_required' AND j.available_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now()) ORDER BY j.available_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING calendar_job.*`,
    );
    const job = result.rows[0] as unknown as Job | undefined;
    if (!job) break;
    try {
      await syncJob(job);
      await db.execute(
        sql`DELETE FROM calendar_job WHERE email=${job.email} AND task_id=${job.task_id} AND generation=${job.generation} AND lease_until=${job.lease_until}`,
      );
      processed++;
    } catch (e) {
      const code =
        e instanceof CalendarError ? e.code : "temporarily_unavailable";
      const delay = Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7));
      await db.execute(
        sql`UPDATE calendar_job SET attempts=attempts+1,available_at=now()+${delay}*interval '1 second',last_error=${code} WHERE email=${job.email} AND task_id=${job.task_id} AND generation=${job.generation} AND lease_until=${job.lease_until}`,
      );
      await db
        .update(s.calendarConnection)
        .set({ errorCode: code })
        .where(eq(s.calendarConnection.email, job.email));
    } finally {
      await db.execute(
        sql`UPDATE calendar_job SET lease_until=NULL WHERE email=${job.email} AND task_id=${job.task_id} AND lease_until=${job.lease_until}`,
      );
    }
  }
  return processed;
}
export async function nextCalendarJobDelay() {
  const { db } = await database();
  const result = await db.execute(
    sql`SELECT min(greatest(j.available_at,coalesce(j.lease_until,j.available_at))) AS next FROM calendar_job j JOIN calendar_connection c ON c.email=j.email JOIN member m ON m.email=j.email WHERE c.enabled AND NOT m.disabled AND coalesce((SELECT (w.configuration->>'calendarEnabled')::boolean FROM workspace_setting w WHERE w.id='primary'),true) AND coalesce(c.error_code,'')<>'reconnect_required'`,
  );
  const next = result.rows[0]?.next;
  return next
    ? Math.max(0, Math.ceil((+new Date(next as string) - Date.now()) / 1000))
    : null;
}
export async function dispatchCalendarJobs() {
  const delay = await nextCalendarJobDelay();
  if (delay === null) return;
  if (process.env.VERCEL) {
    const { QueueClient } = await import("@vercel/queue");
    const queue = new QueueClient({ region: "sin1" });
    await queue.send(
      "evolve-calendar",
      { kind: "drain" },
      { delaySeconds: Math.min(delay, 3600) },
    );
  } else await processCalendarJobs(1);
}

// Process one durable job in the originating function, then wake the queue for
// remaining work/retries. A delayed queue callback must not stall an explicit sync.
export async function startCalendarJobs(scope?: CalendarJobScope) {
  await processCalendarJobs(1, scope);
  if (process.env.VERCEL) await dispatchCalendarJobs();
}
