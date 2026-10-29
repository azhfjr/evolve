import { createHash } from "node:crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import * as s from "../db/schema";
import { assertActorActive } from "../membership";
import { AppError, requireAdmin } from "../permissions";
import { readWorkspaceExperience } from "../workspace-experience";
import type { Actor, Activity, WorkspaceData } from "../types";

export async function boardManagementData(
  actor: Actor,
): Promise<WorkspaceData> {
  const { db } = await database();
  const experience = await readWorkspaceExperience(db, actor);
  const [members, projects, config] = await Promise.all([
    db.select().from(s.member).orderBy(s.member.name),
    db.select().from(s.boardRoomProject).orderBy(s.boardRoomProject.externalId),
    db
      .select()
      .from(s.boardRoomConfig)
      .where(eq(s.boardRoomConfig.id, "primary")),
  ]);
  return {
    ...experience,
    adminEmail: process.env.ADMIN_EMAIL || "",
    members,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.data.name,
      description: p.data.description,
      color: "green",
      createdAt: p.updatedAt.toISOString(),
    })),
    tasks: [],
    activities: [],
    notifications: [],
    nextCursor: null,
    revision: config[0]?.revision ?? 0,
  };
}

const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  actor: z.union([z.email(), z.literal("")]).default(""),
  projectId: z.uuid().optional(),
  kind: z
    .enum(["all", "project", "progress", "documents", "review"])
    .default("all"),
  scope: z.enum(["workspace", "mine"]).default("workspace"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(2000).optional(),
});
const kindSQL = sql<string>`CASE WHEN h.kind IN ('project_created','project_updated','csv_import') THEN 'project' WHEN h.kind='documents_changed' THEN 'documents' WHEN h.kind='progress' THEN 'progress' ELSE 'review' END`;
const messageSQL = sql<string>`CASE h.kind WHEN 'project_created' THEN 'Created project: ' WHEN 'project_updated' THEN 'Updated project: ' WHEN 'csv_import' THEN 'Imported project: ' WHEN 'documents_changed' THEN 'Changed documents: ' WHEN 'progress' THEN 'Updated progress: ' ELSE 'Reviewed documents: ' END || (p.data->>'name')`;
export async function boardActivityReport(
  actor: Actor,
  params: URLSearchParams,
) {
  const { db } = await database();
  const experience = await readWorkspaceExperience(db, actor);
  const input = querySchema.parse(
    Object.fromEntries([...params].filter(([, v]) => v !== "")),
  );
  if (input.from && input.to && input.to < input.from)
    throw new AppError("End date must be on or after the start date.", 400);
  const { cursor, ...filters } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([actor.email, filters, experience.profile.timeZone]))
    .digest("hex");
  const conditions: SQL[] = [sql`TRUE`];
  if (input.scope === "mine") conditions.push(sql`h.actor=${actor.email}`);
  else if (input.actor) conditions.push(sql`h.actor=${input.actor}`);
  if (input.projectId) conditions.push(sql`h.project_id=${input.projectId}`);
  if (input.kind !== "all") conditions.push(sql`${kindSQL}=${input.kind}`);
  if (input.q) {
    const pattern = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      sql`(${messageSQL} ILIKE ${pattern} OR h.actor ILIKE ${pattern})`,
    );
  }
  const zone = experience.profile.timeZone;
  if (input.from)
    conditions.push(
      sql`h.created_at>=(((${input.from}::date)::timestamp AT TIME ZONE ${zone}) AT TIME ZONE 'UTC')`,
    );
  if (input.to)
    conditions.push(
      sql`h.created_at<(((${input.to}::date+interval '1 day') AT TIME ZONE ${zone}) AT TIME ZONE 'UTC')`,
    );
  const base = and(...conditions)!;
  if (cursor) {
    try {
      const c = z
        .object({
          id: z.uuid(),
          at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/),
          fingerprint: z.literal(fingerprint),
        })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
      conditions.push(sql`(h.created_at,h.id)<(${c.at}::timestamp,${c.id})`);
    } catch {
      throw new AppError(
        "Activity filters changed or the page cursor is invalid.",
        400,
      );
    }
  }
  const [rows, count] = await Promise.all([
    db.execute(
      sql`SELECT h.id,h.actor,h.project_id AS "projectId",${kindSQL} AS kind,${messageSQL} AS message,to_char(h.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US') AS "cursorAt",h.created_at AS "createdAt" FROM board_room_history h JOIN board_room_project p ON p.id=h.project_id WHERE ${and(...conditions)} ORDER BY h.created_at DESC,h.id DESC LIMIT ${input.limit + 1}`,
    ),
    db.execute(
      sql`SELECT count(*)::int AS total FROM board_room_history h JOIN board_room_project p ON p.id=h.project_id WHERE ${base}`,
    ),
  ]);
  const page = rows.rows.slice(0, input.limit),
    last = page.at(-1);
  return {
    activities: page.map((row): Activity => {
      return {
        id: String(row.id),
        actor: String(row.actor),
        message: String(row.message),
        kind: String(row.kind),
        projectId: String(row.projectId),
        taskId: null,
        createdAt: new Date(row.createdAt as string).toISOString(),
      };
    }),
    total: Number(count.rows[0].total),
    nextCursor:
      rows.rows.length > input.limit && last
        ? Buffer.from(
            JSON.stringify({ id: last.id, at: last.cursorAt, fingerprint }),
          ).toString("base64url")
        : null,
  };
}
export async function deleteBoardActivities(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const { ids } = z
    .object({ ids: z.array(z.uuid()).min(1).max(100) })
    .strict()
    .parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    const removed = await tx
      .delete(s.boardRoomHistory)
      .where(inArray(s.boardRoomHistory.id, ids))
      .returning({ id: s.boardRoomHistory.id });
    await tx
      .update(s.boardRoomConfig)
      .set({ revision: sql`${s.boardRoomConfig.revision}+1` })
      .where(eq(s.boardRoomConfig.id, "primary"));
    return { ok: true, deletedActivityIds: removed.map((row) => row.id) };
  });
}
