import { createHash } from "node:crypto";
import { and, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { assertActorActive } from "./membership";
import { database } from "./db";
import * as s from "./db/schema";
import { AppError, requireAdmin } from "./permissions";
import { preferenceSchema, workspaceConfigurationSchema } from "./preferences";
import type { Actor, Status, Priority, Task, Activity } from "./types";
export type DashboardReport = {
  timeZone: string;
  days: number;
  today: string;
  totals: {
    total: number;
    completed: number;
    open: number;
    overdue: number;
    unassigned: number;
  };
  statuses: Record<Status, number>;
  priorities: Record<Priority, number>;
  trend: { day: string; created: number; completed: number }[];
  schedule: { day: string; count: number }[];
  attention: { overdue: number; unassigned: number; unscheduled: number };
  workload: { email: string | null; count: number; overdue: number }[];
  deadlines: Task[];
  deadlineBuckets: Record<
    "overdue" | "today" | "future" | "unscheduled",
    number
  >;
  projectProgress: {
    id: string;
    name: string;
    total: number;
    completed: number;
  }[];
};
export async function dashboardReport(
  actor: Actor,
  range = 30,
): Promise<DashboardReport> {
  const days = z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .parse(range);
  const { db } = await database();
  const [profile] = await db
    .select({ timeZone: s.member.timeZone })
    .from(s.member)
    .where(eq(s.member.email, actor.email));
  const zone = profile?.timeZone || "Asia/Jakarta";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [
    groups,
    totals,
    trend,
    workload,
    deadlines,
    buckets,
    projectProgress,
    schedule,
  ] = await Promise.all([
    db.execute(
      sql`SELECT status,priority,count(*)::int AS count FROM task WHERE NOT archived GROUP BY status,priority`,
    ),
    db.execute(
      sql`SELECT count(*) FILTER(WHERE status<>'done' AND due_date<${today})::int AS overdue,count(*) FILTER(WHERE status<>'done' AND assignee IS NULL)::int AS unassigned FROM task WHERE NOT archived`,
    ),
    db.execute(
      sql`WITH days AS (SELECT to_char(d,'YYYY-MM-DD') AS day FROM generate_series(date_trunc('day',now() AT TIME ZONE ${zone})-(${days}-1)*interval '1 day',date_trunc('day',now() AT TIME ZONE ${zone}),interval '1 day') d),created AS(SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${zone},'YYYY-MM-DD') AS day,count(*)::int AS count FROM task WHERE created_at>=now()-(${days}+1)*interval '1 day' GROUP BY 1),completed AS(SELECT to_char((completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${zone},'YYYY-MM-DD') AS day,count(*)::int AS count FROM task WHERE completed_at>=now()-(${days}+1)*interval '1 day' GROUP BY 1) SELECT d.day,coalesce(c.count,0)::int AS created,coalesce(f.count,0)::int AS completed FROM days d LEFT JOIN created c USING(day) LEFT JOIN completed f USING(day) ORDER BY d.day`,
    ),
    db.execute(
      sql`SELECT assignee AS email,count(*)::int AS count,count(*) FILTER(WHERE due_date<${today})::int AS overdue FROM task WHERE NOT archived AND status<>'done' GROUP BY assignee ORDER BY count(*) DESC,assignee NULLS FIRST`,
    ),
    db
      .select()
      .from(s.task)
      .where(
        and(
          eq(s.task.archived, false),
          sql`${s.task.status}<>'done'`,
          sql`${s.task.dueDate} IS NOT NULL`,
        ),
      )
      .orderBy(s.task.dueDate, s.task.id)
      .limit(6),
    db.execute(
      sql`SELECT count(*) FILTER(WHERE due_date<${today})::int AS overdue,count(*) FILTER(WHERE due_date=${today})::int AS today,count(*) FILTER(WHERE due_date>${today})::int AS future,count(*) FILTER(WHERE due_date IS NULL)::int AS unscheduled FROM task WHERE NOT archived AND status<>'done'`,
    ),
    db.execute(
      sql`SELECT p.id,p.name,count(t.id)::int AS total,count(t.id) FILTER(WHERE t.status='done')::int AS completed FROM project p LEFT JOIN task t ON t.project_id=p.id AND NOT t.archived GROUP BY p.id,p.name ORDER BY p.name,p.id`,
    ),
    db.execute(
      sql`WITH days AS (SELECT to_char(d,'YYYY-MM-DD') AS day FROM generate_series(${today}::date,${today}::date+13,interval '1 day') d) SELECT d.day,count(t.id)::int AS count FROM days d LEFT JOIN task t ON NOT t.archived AND t.status<>'done' AND t.due_date>=d.day AND coalesce(t.start_date,t.due_date)<=d.day GROUP BY d.day ORDER BY d.day`,
    ),
  ]);
  const statuses: DashboardReport["statuses"] = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };
  const priorities: DashboardReport["priorities"] = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };
  for (const group of groups.rows) {
    statuses[group.status as Status] += Number(group.count);
    if (group.status !== "done")
      priorities[group.priority as Priority] += Number(group.count);
  }
  const total = Object.values(statuses).reduce((a, b) => a + b, 0);
  return JSON.parse(
    JSON.stringify({
      timeZone: zone,
      days,
      today,
      totals: {
        total,
        completed: statuses.done,
        open: total - statuses.done,
        overdue: Number(totals.rows[0].overdue),
        unassigned: Number(totals.rows[0].unassigned),
      },
      statuses,
      priorities,
      trend: trend.rows,
      schedule: schedule.rows,
      attention: {
        overdue: Number(totals.rows[0].overdue),
        unassigned: Number(totals.rows[0].unassigned),
        unscheduled: Number(buckets.rows[0].unscheduled),
      },
      workload: workload.rows,
      deadlines,
      deadlineBuckets: buckets.rows[0],
      projectProgress: projectProgress.rows,
    }),
  );
}
export async function activityReport(actor: Actor, params: URLSearchParams) {
  const { db } = await database();
  const [workspace] = await db
    .select({ configuration: s.workspaceSetting.configuration })
    .from(s.workspaceSetting)
    .where(eq(s.workspaceSetting.id, "primary"));
  const config = workspaceConfigurationSchema.parse(
    workspace?.configuration || {},
  );
  const [member] = await db
    .select({ preferences: s.member.preferences, timeZone: s.member.timeZone })
    .from(s.member)
    .where(eq(s.member.email, actor.email));
  const preference = preferenceSchema.parse(member?.preferences || {});
  const input = z
    .object({
      q: z.string().trim().max(200).default(""),
      actor: z.union([z.email(), z.literal("")]).default(""),
      projectId: z.uuid().optional(),
      kind: z
        .enum([
          "all",
          "task",
          "project",
          "member",
          "settings",
          "finance",
          "calendar",
        ])
        .default("all"),
      scope: z.enum(["workspace", "mine"]).default(preference.activityScope),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(Number(config.activityPageSize)),
      cursor: z.string().max(2000).optional(),
    })
    .parse(Object.fromEntries([...params].filter(([, value]) => value !== "")));
  if (input.from && input.to && input.to < input.from)
    throw new AppError("End date must be on or after the start date.", 400);
  const zone = member?.timeZone || "Asia/Jakarta";
  const { cursor, ...filters } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([actor.email, filters, config.activityWindowDays]))
    .digest("hex")
    .slice(0, 20);
  const conditions: SQL[] = [];
  if (input.scope === "mine")
    conditions.push(eq(s.activity.actor, actor.email));
  else if (input.actor) conditions.push(eq(s.activity.actor, input.actor));
  if (input.q) {
    const pattern = "%" + input.q.replace(/[\\%_]/g, "\\$&") + "%";
    conditions.push(
      sql`(${s.activity.message} ILIKE ${pattern} OR ${s.activity.actor} ILIKE ${pattern})`,
    );
  }
  if (input.projectId)
    conditions.push(
      sql`coalesce(${s.activity.projectId},${s.task.projectId})=${input.projectId}`,
    );
  if (input.kind !== "all") conditions.push(eq(s.activity.kind, input.kind));
  if (config.activityWindowDays !== "all")
    conditions.push(
      sql`${s.activity.createdAt}>=now()-${Number(config.activityWindowDays)}*interval '1 day'`,
    );
  if (input.from)
    conditions.push(
      sql`${s.activity.createdAt}>=(((${input.from}::date)::timestamp AT TIME ZONE ${zone}) AT TIME ZONE 'UTC')`,
    );
  if (input.to)
    conditions.push(
      sql`${s.activity.createdAt}<(((${input.to}::date+interval '1 day') AT TIME ZONE ${zone}) AT TIME ZONE 'UTC')`,
    );
  const base = [...conditions];
  if (cursor) {
    let data: { id: string; at: string; fingerprint: string };
    try {
      data = z
        .object({
          id: z.uuid(),
          at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/),
          fingerprint: z.literal(fingerprint),
        })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    } catch {
      throw new AppError(
        "Activity filters changed or the page cursor is invalid.",
        400,
      );
    }
    conditions.push(
      sql`(${s.activity.createdAt},${s.activity.id})<(${data.at}::timestamp,${data.id})`,
    );
  }
  const [rows, count] = await Promise.all([
    db
      .select({
        ...getTableColumns(s.activity),
        cursorAt: sql<string>`to_char(${s.activity.createdAt},'YYYY-MM-DD"T"HH24:MI:SS.US')`,
      })
      .from(s.activity)
      .leftJoin(s.task, eq(s.task.id, s.activity.taskId))
      .where(and(...conditions))
      .orderBy(desc(s.activity.createdAt), desc(s.activity.id))
      .limit(input.limit + 1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(s.activity)
      .leftJoin(s.task, eq(s.task.id, s.activity.taskId))
      .where(and(...base)),
  ]);
  const page = rows.slice(0, input.limit),
    last = page.at(-1);
  return JSON.parse(
    JSON.stringify({
      activities: page.map(({ cursorAt: _, ...row }) => {
        void _;
        return row as unknown as Activity;
      }),
      total: count[0].count,
      nextCursor:
        rows.length > input.limit && last
          ? Buffer.from(
              JSON.stringify({ id: last.id, at: last.cursorAt, fingerprint }),
            ).toString("base64url")
          : null,
    }),
  );
}
export async function administrationReport(actor: Actor) {
  requireAdmin(actor);
  const { db } = await database();
  await assertActorActive(db, actor);
  const [sessions, connections, queue] = await Promise.all([
    db.execute(
      sql`SELECT m.email,bool_or(u.id IS NOT NULL) AS "accountRegistered",count(s.id) FILTER(WHERE s.expires_at>now())::int AS "activeSessions",max(s.updated_at) AS "lastSeenAt" FROM member m LEFT JOIN auth_user u ON u.email=m.email LEFT JOIN auth_session s ON s.user_id=u.id GROUP BY m.email`,
    ),
    db
      .select({
        email: s.calendarConnection.email,
        connected: s.calendarConnection.enabled,
        errorCode: s.calendarConnection.errorCode,
        updatedAt: s.calendarConnection.updatedAt,
      })
      .from(s.calendarConnection),
    db.execute(
      sql`SELECT email,count(*)::int AS pending,count(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed FROM calendar_job GROUP BY email`,
    ),
  ]);
  return JSON.parse(
    JSON.stringify({
      sessions: sessions.rows,
      calendar: connections,
      queue: queue.rows,
    }),
  );
}
