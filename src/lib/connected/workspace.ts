import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { AppError } from "../permissions";
import type { Actor } from "../types";
import { readWorkspaceExperience } from "../workspace-experience";
import { focusDate } from "../workspace-focus";
import { connectedEnabled } from "./transition";
export async function projectHub(actor: Actor, id: string, showTasks = true) {
  z.uuid().parse(id);
  const { db } = await database();
  return db.transaction(
    async (tx) => {
      await assertActorActive(tx, actor);
      const project = (
        await tx.execute(
          sql`SELECT *,data->>'name' AS name FROM board_room_project WHERE id=${id}`,
        )
      ).rows[0];
      if (!project) throw new AppError("Project not found.", 404);
      const experience = await readWorkspaceExperience(tx, actor),
        today = focusDate(experience.profile.timeZone);
      const counts = showTasks
        ? ((
            await tx.execute(
              sql`SELECT count(*)::int total,count(*) FILTER(WHERE status='done')::int completed,count(*) FILTER(WHERE status<>'done')::int open,count(*) FILTER(WHERE status<>'done' AND due_date<${today})::int overdue,count(*) FILTER(WHERE status<>'done' AND EXISTS(SELECT 1 FROM task_dependency d JOIN task b ON b.id=d.depends_on_id WHERE d.task_id=t.id AND b.status<>'done'))::int blocked FROM task t WHERE project_id=${id} AND NOT archived`,
            )
          ).rows[0] as unknown as {
            total: number;
            completed: number;
            open: number;
            overdue: number;
            blocked: number;
          })
        : { total: 0, completed: 0, open: 0, overdue: 0, blocked: 0 };
      const evidence = (
        await tx.execute(
          sql`SELECT (SELECT count(*)::int FROM board_asset WHERE project_id=${id}) AS assets,(SELECT count(*)::int FROM attachment WHERE entity_type='boardRoomProject' AND entity_id=${id} AND state='ready' AND is_current) AS documents`,
        )
      ).rows[0];
      const assets = await tx.execute(
        sql`SELECT id,code,data FROM board_asset WHERE project_id=${id} ORDER BY code LIMIT 100`,
      );
      const totals = await tx.execute(
        sql`SELECT data->>'unit' AS unit,sum((data->>'capacity')::numeric)::text AS capacity,count(*)::int AS count FROM board_asset WHERE project_id=${id} AND data->>'capacity' IS NOT NULL GROUP BY 1 ORDER BY 1`,
      );
      const tasks = showTasks
        ? await tx.execute(
            sql`SELECT id,title,status,assignee,due_date FROM task WHERE project_id=${id} AND NOT archived ORDER BY due_date NULLS LAST,id LIMIT 100`,
          )
        : { rows: [] };
      const activity = await tx.execute(
        sql`SELECT id,kind,detail,created_at AS at FROM board_room_history WHERE project_id=${id} UNION ALL SELECT id,kind,jsonb_build_object('message',message),created_at FROM activity WHERE ${showTasks ? sql`project_id=${id} OR task_id IN(SELECT id FROM task WHERE project_id=${id})` : sql`project_id=${id} AND task_id IS NULL`} ORDER BY at DESC LIMIT 30`,
      );
      return {
        project,
        timeZone: experience.profile.timeZone,
        assetCount: Number(evidence.assets),
        documentCount: Number(evidence.documents),
        documentValid:
          Number(evidence.documents) > 0 &&
          project.document_revision === project.reviewed_revision,
        canonicalProjects: await connectedEnabled(tx),
        counts,
        assets: assets.rows,
        assetTotals: totals.rows,
        tasks: tasks.rows,
        activity: activity.rows,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export type SearchResult = {
  id: string;
  kind: "project" | "asset" | "task" | "document";
  title: string;
  context: string;
  href: string;
};
export async function unifiedSearch(actor: Actor, input: unknown) {
  const q = z
      .object({
        q: z.string().trim().min(2).max(200),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(input),
    { db } = await database();
  await assertActorActive(db, actor);
  const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
  const entities = sql`WITH entities AS (
 SELECT id,'project' AS kind,data->>'name' AS title,external_id AS context,'/board-room/projects/'||id AS href,(data->>'name')||' '||external_id AS searchable FROM board_room_project
 UNION ALL SELECT a.id,'asset',a.data->>'name',a.code||' · '||coalesce(p.data->>'name','Unassigned'),'/board-room?section=assets&asset='||a.id,a.code||' '||(a.data->>'name') FROM board_asset a LEFT JOIN board_room_project p ON p.id=a.project_id
 UNION ALL SELECT t.id,'task',t.title,coalesce(p.name,''),'/app?section=tasks&task='||t.id,t.title FROM task t LEFT JOIN project p ON p.id=t.project_id
 UNION ALL SELECT f.id,'document',f.filename,coalesce(b.data->>'name',p.name,tp.name,''),'/api/attachments/'||f.id||'/content',f.filename FROM attachment f LEFT JOIN board_room_project b ON f.entity_type='boardRoomProject' AND b.id=f.entity_id LEFT JOIN project p ON f.entity_type='project' AND p.id=f.entity_id LEFT JOIN task t ON f.entity_type='task' AND t.id=f.entity_id LEFT JOIN project tp ON tp.id=t.project_id WHERE f.state='ready' AND f.is_current AND (b.id IS NOT NULL OR p.id IS NOT NULL OR t.id IS NOT NULL)
 )`;
  return db.transaction(
    async (tx) => {
      const result = await tx.execute(
        sql`${entities} SELECT id,kind,title,context,href,count(*) OVER()::int AS total FROM entities WHERE searchable ILIKE ${term} ORDER BY kind,lower(title),id LIMIT 25 OFFSET ${(q.page - 1) * 25}`,
      );
      const count = await tx.execute(
        sql`${entities} SELECT count(*)::int AS total FROM entities WHERE searchable ILIKE ${term}`,
      );
      return {
        items: result.rows as unknown as SearchResult[],
        total: Number(count.rows[0].total),
        page: q.page,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function personalActions(actor: Actor, input: unknown = {}) {
  const page = z.coerce.number().int().min(1).max(1000000).default(1);
  const q = z
    .object({ tasksPage: page, notificationsPage: page, reviewsPage: page })
    .parse(input);
  const { db } = await database();
  return db.transaction(
    async (tx) => {
      await assertActorActive(tx, actor);
      const experience = await readWorkspaceExperience(tx, actor),
        today = focusDate(experience.profile.timeZone);
      const tasksWhere = sql`t.assignee=${actor.email} AND NOT t.archived AND t.status<>'done'`;
      const reviewsWhere = sql`p.reviewed_revision IS DISTINCT FROM p.document_revision AND EXISTS(SELECT 1 FROM attachment a WHERE a.entity_type='boardRoomProject' AND a.entity_id=p.id AND a.state='ready' AND a.is_current)`;
      const tasks = await tx.execute(
        sql`SELECT t.id,t.title,t.due_date AS "dueDate",t.project_id AS "projectId",p.name AS "projectName",(t.due_date<${today}) AS overdue FROM task t JOIN project p ON p.id=t.project_id WHERE ${tasksWhere} ORDER BY t.due_date NULLS LAST,t.id LIMIT 100 OFFSET ${(q.tasksPage - 1) * 100}`,
      );
      const notifications = await tx.execute(
        sql`SELECT id,task_id AS "taskId",message,read FROM notification WHERE email=${actor.email} ORDER BY created_at DESC,id LIMIT 100 OFFSET ${(q.notificationsPage - 1) * 100}`,
      );
      const review = actor.isAdmin
        ? await tx.execute(
            sql`SELECT p.id,p.data->>'name' AS name FROM board_room_project p WHERE ${reviewsWhere} ORDER BY p.id LIMIT 50 OFFSET ${(q.reviewsPage - 1) * 50}`,
          )
        : { rows: [] };
      const counts = (
        await tx.execute(
          sql`SELECT (SELECT count(*)::int FROM task t JOIN project p ON p.id=t.project_id WHERE ${tasksWhere}) AS tasks,(SELECT count(*)::int FROM notification WHERE email=${actor.email}) AS notifications,${actor.isAdmin ? sql`(SELECT count(*)::int FROM board_room_project p WHERE ${reviewsWhere})` : sql`0`} AS review`,
        )
      ).rows[0];
      return {
        tasks: tasks.rows,
        notifications: notifications.rows,
        review: review.rows,
        today,
        pagination: {
          tasks: { page: q.tasksPage, limit: 100, total: Number(counts.tasks) },
          notifications: {
            page: q.notificationsPage,
            limit: 100,
            total: Number(counts.notifications),
          },
          review: {
            page: q.reviewsPage,
            limit: 50,
            total: Number(counts.review),
          },
        },
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
