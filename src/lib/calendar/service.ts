import { assertActorActive } from "../membership";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { database, type Database } from "../db";
import * as s from "../db/schema";
import { AppError } from "../permissions";
import { workspaceConfigurationSchema } from "../preferences";
import type { Actor } from "../types";
import {
  CALENDAR_SCOPE,
  CalendarError,
  decryptCalendarToken,
  encryptCalendarToken,
  googleJson,
} from "./google";
export const calendarPreferenceSchema = z
  .object({
    syncScope: z.enum(["assigned", "all"]),
    reminders: z
      .array(z.number().int().min(0).max(40320))
      .max(5)
      .refine(
        (values) => new Set(values).size === values.length,
        "Pengingat tidak boleh berulang.",
      ),
  })
  .strict();
export function calendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_SECRET.length >= 32,
  );
}
export function calendarCallbackURL() {
  return new URL(
    "/api/calendar/callback",
    process.env.BETTER_AUTH_URL,
  ).toString();
}
export async function queueTaskSync(
  tx: Pick<Database, "execute">,
  taskId: string | string[],
) {
  if (Array.isArray(taskId) && !taskId.length) return;
  const scope = Array.isArray(taskId)
    ? sql`t.id IN (${sql.join(
        taskId.map((id) => sql`${id}`),
        sql`,`,
      )})`
    : sql`t.id=${taskId}`;
  await tx.execute(sql`
 INSERT INTO calendar_job(email,task_id) SELECT c.email,t.id FROM calendar_connection c JOIN member m ON m.email=c.email CROSS JOIN task t
 WHERE ${scope} AND c.enabled AND NOT m.disabled AND (c.sync_scope='all' OR t.assignee=c.email OR EXISTS(SELECT 1 FROM calendar_task_preference p WHERE p.email=c.email AND p.task_id=t.id) OR EXISTS(SELECT 1 FROM calendar_event e WHERE e.email=c.email AND e.task_id=t.id) OR EXISTS(SELECT 1 FROM calendar_job j WHERE j.email=c.email AND j.task_id=t.id))
 ON CONFLICT(email,task_id) DO UPDATE SET generation=calendar_job.generation+1,attempts=0,available_at=now(),last_error=NULL`);
}
export async function queueAllCalendarTasks(
  tx: Pick<Database, "execute">,
  email: string,
) {
  await tx.execute(sql`
 INSERT INTO calendar_job(email,task_id) SELECT c.email,t.id FROM calendar_connection c JOIN member m ON m.email=c.email CROSS JOIN task t WHERE c.email=${email} AND c.enabled AND NOT m.disabled AND ((NOT t.archived AND t.status<>'done' AND t.due_date IS NOT NULL AND ((coalesce((SELECT p.enabled FROM calendar_task_preference p WHERE p.email=c.email AND p.task_id=t.id),c.sync_scope='all' OR t.assignee=c.email)))) OR EXISTS(SELECT 1 FROM calendar_event e WHERE e.email=c.email AND e.task_id=t.id) OR EXISTS(SELECT 1 FROM calendar_job j WHERE j.email=c.email AND j.task_id=t.id))
 UNION ALL SELECT c.email,e.task_id FROM calendar_connection c JOIN member m ON m.email=c.email JOIN calendar_event e ON e.email=c.email WHERE c.email=${email} AND c.enabled AND NOT m.disabled AND NOT EXISTS(SELECT 1 FROM task t WHERE t.id=e.task_id) AND NOT EXISTS(SELECT 1 FROM legacy_record l WHERE l.kind='task' AND l.id=e.task_id)
 ON CONFLICT(email,task_id) DO UPDATE SET generation=calendar_job.generation+1,attempts=0,available_at=now(),last_error=NULL`);
}
export async function pauseCalendarJobs(
  tx: Pick<Database, "execute">,
  email: string,
) {
  // Retain first-write identities and leases until the owner reconnects.
  // Invalidating the generation stops an in-flight worker deleting this recovery job.
  await tx.execute(
    sql`UPDATE calendar_job SET generation=generation+1,attempts=0,available_at=now(),last_error=NULL WHERE email=${email}`,
  );
}
export async function calendarStatus(actor: Actor) {
  const { db } = await database();
  const [workspace] = await db
    .select({ configuration: s.workspaceSetting.configuration })
    .from(s.workspaceSetting)
    .where(eq(s.workspaceSetting.id, "primary"));
  const configuration = workspaceConfigurationSchema.parse(
    workspace?.configuration || {},
  );
  const [connection] = await db
    .select()
    .from(s.calendarConnection)
    .where(eq(s.calendarConnection.email, actor.email));
  const counts = await db.execute(
    sql`SELECT count(*)::int AS pending FROM calendar_job WHERE email=${actor.email}`,
  );
  return {
    configured: calendarConfigured(),
    enabledByAdmin: configuration.calendarEnabled,
    timeZone: connection?.timeZone || null,
    connected: Boolean(connection?.enabled),
    syncScope: connection?.syncScope || "assigned",
    reminders: connection?.reminders || [1440, 30],
    pending: connection?.enabled ? Number(counts.rows[0].pending) : 0,
    version: connection?.version || 1,
    errorCode: connection?.errorCode || null,
    lastSyncedAt: connection?.updatedAt.toISOString() || null,
  };
}
export async function startCalendarConnection(
  actor: Actor,
  returnTaskId?: string,
) {
  if (!calendarConfigured())
    throw new AppError("Integrasi Google Calendar belum dikonfigurasi.", 503);
  const status = await calendarStatus(actor);
  if (!status.enabledByAdmin)
    throw new AppError(
      "Calendar integration is paused by the administrator.",
      503,
    );
  if (returnTaskId) {
    z.uuid().parse(returnTaskId);
    const { db } = await database();
    if (
      !(
        await db
          .select({ id: s.task.id })
          .from(s.task)
          .where(eq(s.task.id, returnTaskId))
      )[0]
    )
      throw new AppError("Task not found.", 404);
  }
  const raw = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const { db } = await database();
  if (actor.isAdmin)
    await db
      .insert(s.member)
      .values({ email: actor.email, name: actor.name })
      .onConflictDoNothing();
  await db
    .delete(s.calendarOauthState)
    .where(sql`${s.calendarOauthState.expiresAt}<now()`);
  await db.insert(s.calendarOauthState).values({
    hash: createHash("sha256").update(raw).digest("hex"),
    email: actor.email,
    returnTaskId: returnTaskId || null,
    verifier: encryptCalendarToken(verifier, actor.email),
    expiresAt: new Date(Date.now() + 600000),
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: calendarCallbackURL(),
    response_type: "code",
    scope: `openid email ${CALENDAR_SCOPE}`,
    state: raw,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    login_hint: actor.email,
  }).toString();
  return { url: url.toString(), state: raw };
}
export async function finishCalendarConnection(
  actor: Actor,
  state: string,
  cookie: string,
  code: string,
) {
  if (
    !state ||
    state.length > 200 ||
    !cookie ||
    Buffer.byteLength(state) !== Buffer.byteLength(cookie) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))
  )
    throw new AppError(
      "Permintaan Calendar tidak valid atau sudah kedaluwarsa.",
      400,
    );
  const { db } = await database();
  const [saved] = await db
    .delete(s.calendarOauthState)
    .where(
      and(
        eq(
          s.calendarOauthState.hash,
          createHash("sha256").update(state).digest("hex"),
        ),
        eq(s.calendarOauthState.email, actor.email),
        gt(s.calendarOauthState.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!saved)
    throw new AppError(
      "Permintaan Calendar sudah digunakan atau kedaluwarsa.",
      400,
    );
  const tokenResult = await googleJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: calendarCallbackURL(),
      grant_type: "authorization_code",
      code_verifier: decryptCalendarToken(saved.verifier, actor.email),
    }),
  });
  const tokens = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().optional(),
      expires_in: z.number().int().min(1).max(86400),
      scope: z.string(),
    })
    .parse(tokenResult.data);
  if (!tokens.scope.split(" ").includes(CALENDAR_SCOPE))
    throw new AppError("Izin kalender Evolve belum diberikan.", 403);
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  const identity = (
    await googleJson("https://openidconnect.googleapis.com/v1/userinfo", {
      headers,
    })
  ).data;
  if (
    identity.email_verified !== true ||
    typeof identity.email !== "string" ||
    identity.email.toLowerCase() !== actor.email
  )
    throw new AppError(
      "Hubungkan akun Google yang sama dengan email login Anda.",
      403,
    );
  const [existing] = await db
    .select()
    .from(s.calendarConnection)
    .where(eq(s.calendarConnection.email, actor.email));
  const refreshToken =
    tokens.refresh_token ||
    (existing
      ? decryptCalendarToken(existing.refreshToken, actor.email)
      : null);
  if (!refreshToken) throw new CalendarError("reconnect_required");
  const [member] = await db
    .select()
    .from(s.member)
    .where(eq(s.member.email, actor.email));
  if (!member || member.disabled)
    throw new AppError("Akses workspace telah dicabut.", 403);
  let calendarId: string | undefined = existing?.calendarId;
  if (calendarId) {
    const check = await googleJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      { headers },
      [404, 410],
    );
    if (check.status !== 200) calendarId = undefined;
  }
  if (!calendarId) {
    const created = await googleJson(
      "https://www.googleapis.com/calendar/v3/calendars",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "Evolve",
          description: "Tasks and deadlines from the Evolve planning workspace",
          timeZone: member.timeZone,
        }),
      },
    );
    calendarId = z.string().min(1).parse(created.data.id);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    const [current] = await tx
      .select()
      .from(s.member)
      .where(
        and(eq(s.member.email, actor.email), eq(s.member.disabled, false)),
      );
    if (!current) throw new AppError("Akses telah dicabut.", 403);
    const values = {
      email: actor.email,
      accessToken: encryptCalendarToken(tokens.access_token, actor.email),
      refreshToken: encryptCalendarToken(refreshToken, actor.email),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      calendarId: calendarId!,
      timeZone: current.timeZone,
      enabled: true,
      errorCode: null,
      updatedAt: new Date(),
    };
    await tx
      .insert(s.calendarConnection)
      .values(values)
      .onConflictDoUpdate({
        target: s.calendarConnection.email,
        set: { ...values, version: sql`${s.calendarConnection.version}+1` },
      });
    if (existing?.calendarId && existing.calendarId !== calendarId)
      await tx
        .delete(s.calendarEvent)
        .where(eq(s.calendarEvent.email, actor.email));
    const [returnTask] = saved.returnTaskId
      ? await tx
          .select({ id: s.task.id })
          .from(s.task)
          .where(eq(s.task.id, saved.returnTaskId))
      : [];
    if (returnTask)
      await tx.execute(
        sql`INSERT INTO calendar_task_preference(email,task_id,enabled) VALUES(${actor.email},${returnTask.id},true) ON CONFLICT(email,task_id) DO UPDATE SET enabled=true`,
      );
    await queueAllCalendarTasks(tx, actor.email);
    return returnTask?.id || null;
  });
}
export async function updateCalendarSettings(actor: Actor, input: unknown) {
  const data = calendarPreferenceSchema
    .extend({ version: z.number().int().positive() })
    .parse(input);
  const { db } = await database();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    const [updated] = await tx
      .update(s.calendarConnection)
      .set({
        syncScope: data.syncScope,
        reminders: data.reminders,
        version: sql`${s.calendarConnection.version}+1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(s.calendarConnection.email, actor.email),
          eq(s.calendarConnection.version, data.version),
          eq(s.calendarConnection.enabled, true),
        ),
      )
      .returning();
    if (!updated)
      throw new AppError(
        "Koneksi berubah. Muat ulang pengaturan Calendar.",
        409,
      );
    await queueAllCalendarTasks(tx, actor.email);
  });
}
export async function disconnectCalendar(actor: Actor) {
  const { db } = await database();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    await pauseCalendarJobs(tx, actor.email);
    await tx
      .update(s.calendarConnection)
      .set({
        enabled: false,
        accessToken: "",
        refreshToken: "",
        expiresAt: new Date(),
        errorCode: null,
        version: sql`${s.calendarConnection.version}+1`,
      })
      .where(eq(s.calendarConnection.email, actor.email));
    await tx
      .delete(s.calendarOauthState)
      .where(eq(s.calendarOauthState.email, actor.email));
  });
}

export async function taskCalendarStatus(actor: Actor, taskId: string) {
  z.uuid().parse(taskId);
  const { db } = await database();
  const [task] = await db.select().from(s.task).where(eq(s.task.id, taskId));
  if (!task) throw new AppError("Task not found.", 404);
  const status = await calendarStatus(actor);
  const [preference] = await db
    .select()
    .from(s.calendarTaskPreference)
    .where(
      and(
        eq(s.calendarTaskPreference.email, actor.email),
        eq(s.calendarTaskPreference.taskId, taskId),
      ),
    );
  const [event] = await db
    .select()
    .from(s.calendarEvent)
    .where(
      and(
        eq(s.calendarEvent.email, actor.email),
        eq(s.calendarEvent.taskId, taskId),
      ),
    );
  const [job] = await db
    .select({
      lastError: s.calendarJob.lastError,
      attempts: s.calendarJob.attempts,
    })
    .from(s.calendarJob)
    .where(
      and(
        eq(s.calendarJob.email, actor.email),
        eq(s.calendarJob.taskId, taskId),
      ),
    );
  const selected =
    preference?.enabled ??
    (status.syncScope === "all" || task.assignee === actor.email);
  const eligible =
    selected &&
    !task.archived &&
    task.status !== "done" &&
    Boolean(task.dueDate);
  return {
    ...status,
    selected,
    eligible,
    override: preference?.enabled ?? null,
    taskState: !status.enabledByAdmin
      ? "paused"
      : !status.connected
        ? "disconnected"
        : job?.lastError
          ? "error"
          : job
            ? "pending"
            : !eligible
              ? "not_scheduled"
              : event && event.syncedVersion >= task.version
                ? "synced"
                : "not_synced",
    lastSyncedAt: event?.syncedAt.toISOString() || null,
    errorCode: job?.lastError || status.errorCode,
  };
}
export async function setTaskCalendar(
  actor: Actor,
  taskId: string,
  enabled: boolean,
) {
  z.uuid().parse(taskId);
  const { db } = await database();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    const [task] = await tx.select().from(s.task).where(eq(s.task.id, taskId));
    if (!task) throw new AppError("Task not found.", 404);
    const state = await calendarStatus(actor);
    if (!state.enabledByAdmin)
      throw new AppError(
        "Calendar integration is paused by the administrator.",
        503,
      );
    if (!state.connected)
      throw new AppError(
        "Connect your Google Calendar before syncing a task.",
        409,
      );
    if (enabled && (!task.dueDate || task.archived || task.status === "done"))
      throw new AppError(
        "Use an active task with a due date to sync to Calendar.",
        400,
      );
    await tx.execute(
      sql`INSERT INTO calendar_task_preference(email,task_id,enabled) VALUES(${actor.email},${taskId},${enabled}) ON CONFLICT(email,task_id) DO UPDATE SET enabled=excluded.enabled`,
    );
    await tx.execute(
      sql`INSERT INTO calendar_job(email,task_id) VALUES(${actor.email},${taskId}) ON CONFLICT(email,task_id) DO UPDATE SET generation=calendar_job.generation+1,attempts=0,available_at=now(),last_error=NULL`,
    );
    await tx.insert(s.activity).values({
      id: crypto.randomUUID(),
      actor: actor.email,
      taskId,
      kind: "calendar",
      message: enabled
        ? "requested Google Calendar sync"
        : "excluded a task from their Google Calendar",
    });
  });
  return taskCalendarStatus(actor, taskId);
}
