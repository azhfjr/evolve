import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { database, type Database } from "./db";
import * as s from "./db/schema";
import { AppError } from "./permissions";
import { cleanLabel, readProjectLabels } from "./labels";
import { hydrateDependencies } from "./planning";
import type { Actor, Task, WorkspaceStats } from "./types";
import { STATUSES, PRIORITIES } from "./types";
export const querySchema = z
  .object({
    mine: z.enum(["true", "false"]).optional(),
    open: z.enum(["true", "false"]).optional(),
    q: z.string().trim().max(200).default(""),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignee: z.union([z.email(), z.literal("unassigned")]).optional(),
    projectId: z.uuid().optional(),
    dueBucket: z
      .enum(["overdue", "today", "future", "upcoming", "unscheduled"])
      .optional(),
    archived: z.enum(["true", "false", "all"]).default("false"),
    sort: z.enum(["updated", "due", "title", "priority"]).default("updated"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    dateMode: z.enum(["due", "overlap"]).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
    cursor: z.string().max(2000).optional(),
  })
  .strict()
  .refine(
    (input) => !input.from || !input.to || input.from <= input.to,
    "End of date window must be on or after its start.",
  );
export async function queryTasks(
  actor: Actor,
  parameters: URLSearchParams,
  connection?: Pick<Database, "select" | "execute">,
) {
  const allowed = new Set(Object.keys(querySchema.shape));
  const raw = Object.fromEntries(
    [...parameters].filter(([key, value]) => allowed.has(key) && value !== ""),
  );
  const input = querySchema.parse(raw);
  const { cursor, ...filters } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([filters, actor.email]))
    .digest("hex")
    .slice(0, 20);
  const db = connection || (await database()).db;
  const conditions: SQL[] =
    input.archived === "all"
      ? []
      : [eq(s.task.archived, input.archived === "true")];
  if (input.mine === "true") conditions.push(eq(s.task.assignee, actor.email));
  if (input.q) {
    const pattern = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
    const tag = cleanLabel(input.q);
    const projects = await db
      .select({ id: s.project.id, labels: s.project.labels })
      .from(s.project);
    const taggedProjectIds = projects
      .filter(
        (project) =>
          tag &&
          readProjectLabels(project.labels).some((label) =>
            label.includes(tag),
          ),
      )
      .map((project) => project.id);
    conditions.push(
      sql`(${s.task.title} ILIKE ${pattern} OR ${s.task.description} ILIKE ${pattern} OR ${taggedProjectIds.length ? inArray(s.task.projectId, taggedProjectIds) : sql`false`})`,
    );
  }
  if (input.open === "true") conditions.push(sql`${s.task.status}<>'done'`);
  if (input.status) conditions.push(eq(s.task.status, input.status));
  if (input.priority) conditions.push(eq(s.task.priority, input.priority));
  if (input.assignee)
    conditions.push(
      input.assignee === "unassigned"
        ? sql`${s.task.assignee} IS NULL`
        : eq(s.task.assignee, input.assignee),
    );
  if (input.projectId) conditions.push(eq(s.task.projectId, input.projectId));
  if (input.dueBucket) {
    const profile = await db
      .select({ timeZone: s.member.timeZone })
      .from(s.member)
      .where(eq(s.member.email, actor.email));
    const today = sql`to_char(now() AT TIME ZONE ${profile[0]?.timeZone || "Asia/Jakarta"},'YYYY-MM-DD')`;
    conditions.push(sql`${s.task.status}<>'done'`);
    conditions.push(
      input.dueBucket === "overdue"
        ? sql`${s.task.dueDate}<${today}`
        : input.dueBucket === "today"
          ? sql`${s.task.dueDate}=${today}`
          : input.dueBucket === "future"
            ? sql`${s.task.dueDate}>${today}`
            : input.dueBucket === "upcoming"
              ? sql`${s.task.dueDate}>=${today}`
              : sql`${s.task.dueDate} IS NULL`,
    );
  }
  if (input.from) conditions.push(sql`${s.task.dueDate}>=${input.from}`);
  if (input.to)
    conditions.push(
      input.dateMode === "overlap"
        ? sql`coalesce(${s.task.startDate},${s.task.dueDate})<=${input.to}`
        : sql`${s.task.dueDate}<=${input.to}`,
    );
  const keys: Record<typeof input.sort, SQL> = {
    updated: sql`${s.task.updatedAt}`,
    due: sql`coalesce(${s.task.dueDate},'9999-12-31')`,
    title: sql`lower(${s.task.title})`,
    priority: sql`CASE ${s.task.priority} WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`,
  };
  const key = keys[input.sort];
  const descending = input.sort === "updated" || input.sort === "priority";
  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.task)
    .where(and(...conditions));
  if (cursor) {
    let decoded: { id: string; key: string; fingerprint: string };
    try {
      decoded = z
        .object({
          id: z.uuid(),
          key: z.string().max(400),
          fingerprint: z.string(),
        })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    } catch {
      throw new AppError("Cursor halaman tidak valid.", 400);
    }
    if (decoded.fingerprint !== fingerprint)
      throw new AppError(
        "Filter halaman telah berubah. Mulai pencarian kembali.",
        400,
      );
    let value: string | number | SQL = decoded.key;
    if (input.sort === "updated") {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(decoded.key) ||
        !Number.isFinite(Date.parse(decoded.key))
      )
        throw new AppError("Cursor halaman tidak valid.", 400);
      value = sql`${decoded.key}::timestamp`;
    }
    if (input.sort === "priority")
      value = z.coerce.number().int().min(0).max(4).parse(value);
    conditions.push(
      descending
        ? sql`(${key},${s.task.id})<(${value},${decoded.id})`
        : sql`(${key},${s.task.id})>(${value},${decoded.id})`,
    );
  }
  const rows = await db
    .select({
      ...getTableColumns(s.task),
      cursorValue:
        input.sort === "updated"
          ? sql`to_char(${s.task.updatedAt},'YYYY-MM-DD"T"HH24:MI:SS.US')`
          : key,
    })
    .from(s.task)
    .where(and(...conditions))
    .orderBy(
      descending ? desc(key) : asc(key),
      descending ? desc(s.task.id) : asc(s.task.id),
    )
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > input.limit && last
      ? Buffer.from(
          JSON.stringify({
            id: last.id,
            key: String(last.cursorValue),
            fingerprint,
          }),
        ).toString("base64url")
      : null;
  const tasks = await hydrateDependencies(
    db,
    page.map(({ cursorValue, ...row }) => {
      void cursorValue;
      return row;
    }),
  );
  return JSON.parse(
    JSON.stringify({ tasks, nextCursor, total: total[0].count }),
  ) as { tasks: Task[]; nextCursor: string | null; total: number };
}
export async function findTask(id: string) {
  z.uuid().parse(id);
  const { db } = await database();
  const rows = await db.select().from(s.task).where(eq(s.task.id, id));
  if (!rows.length) throw new AppError("Task tidak ditemukan.", 404);
  return JSON.parse(
    JSON.stringify((await hydrateDependencies(db, rows))[0]),
  ) as Task;
}
export async function workspaceStatistics(
  actor: Actor,
  timeZone: string,
): Promise<WorkspaceStats> {
  const { db } = await database();
  const [totals, projects, members, days, focus, archived] = await Promise.all([
    db.execute(
      sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='done')::int AS completed,count(*) FILTER(WHERE status IN('in_progress','review'))::int AS motion,count(*) FILTER(WHERE status<>'done' AND due_date>=to_char(date_trunc('week',now() AT TIME ZONE ${timeZone}),'YYYY-MM-DD') AND due_date<to_char(date_trunc('week',now() AT TIME ZONE ${timeZone})+interval '7 days','YYYY-MM-DD'))::int AS due FROM task WHERE NOT archived`,
    ),
    db.execute(
      sql`SELECT project_id,count(*)::int AS total,count(*) FILTER(WHERE status='done')::int AS completed,count(*) FILTER(WHERE status<>'done')::int AS open,count(*) FILTER(WHERE status<>'done' AND due_date<to_char(now() AT TIME ZONE ${timeZone},'YYYY-MM-DD'))::int AS overdue,array_agg(DISTINCT assignee) FILTER(WHERE assignee IS NOT NULL) AS assignees FROM task WHERE NOT archived AND project_id IS NOT NULL GROUP BY project_id`,
    ),
    db.execute(
      sql`SELECT assignee,count(*)::int AS count FROM task WHERE NOT archived AND status<>'done' AND assignee IS NOT NULL GROUP BY assignee`,
    ),
    db.execute(
      sql`SELECT to_char(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone},'YYYY-MM-DD') AS day,count(*)::int AS count FROM task WHERE NOT archived AND status='done' AND completed_at IS NOT NULL AND completed_at>=now()-interval '8 days' GROUP BY day`,
    ),
    db
      .select()
      .from(s.task)
      .where(
        and(
          eq(s.task.assignee, actor.email),
          eq(s.task.archived, false),
          sql`${s.task.status}<>'done'`,
        ),
      )
      .orderBy(
        asc(sql`coalesce(${s.task.dueDate},'9999-12-31')`),
        desc(s.task.updatedAt),
      )
      .limit(8),
    db.execute(sql`SELECT count(*)::int AS count FROM task WHERE archived`),
  ]);
  const byProject: WorkspaceStats["byProject"] = {};
  for (const row of projects.rows)
    byProject[String(row.project_id)] = {
      total: Number(row.total),
      completed: Number(row.completed),
      open: Number(row.open),
      overdue: Number(row.overdue),
      assignees: (row.assignees || []) as string[],
    };
  const byMember = Object.fromEntries(
    members.rows.map((row) => [String(row.assignee), Number(row.count)]),
  );
  return JSON.parse(
    JSON.stringify({
      total: Number(totals.rows[0].total),
      archived: Number(archived.rows[0].count),
      completed: Number(totals.rows[0].completed),
      inMotion: Number(totals.rows[0].motion),
      dueThisWeek: Number(totals.rows[0].due),
      myOpen: byMember[actor.email] || 0,
      byProject,
      byMember,
      completedByDay: Object.fromEntries(
        days.rows.map((row) => [row.day, Number(row.count)]),
      ),
      focus: await hydrateDependencies(db, focus),
    }),
  );
}
