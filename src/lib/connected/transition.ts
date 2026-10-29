import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { AppError, requireAdmin } from "../permissions";
import type { Actor } from "../types";
type DB = Awaited<ReturnType<typeof database>>["db"];
type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
const sources = [
  "project",
  "task",
  "comment",
  "activity",
  "notification",
  "project_expense",
  "task_dependency",
  "task_template",
  "saved_view",
  "command_receipt",
  "calendar_job",
  "calendar_event",
  "calendar_task_preference",
] as const;
async function preview(tx: TX, actor: Actor) {
  const counts: Record<string, number> = {};
  const signature = [];
  for (const name of sources) {
    const rows = await tx.execute(
      sql`SELECT count(*)::int AS n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${sql.identifier(name)} t`,
    );
    counts[name] = Number(rows.rows[0].n);
    signature.push([name, rows.rows[0].hash]);
  }
  return {
    counts,
    token: createHash("sha256")
      .update(JSON.stringify([actor.email, signature]))
      .digest("hex"),
  };
}
export async function connectedEnabled(connection?: Pick<DB, "execute">) {
  return Boolean(
    (
      await (connection ?? (await database()).db).execute(
        sql`SELECT enabled FROM connected_workspace WHERE id='primary'`,
      )
    ).rows[0]?.enabled,
  );
}
export async function transitionPreview(actor: Actor) {
  requireAdmin(actor);
  const { db } = await database();
  return db.transaction(
    async (tx) => {
      await assertActorActive(tx, actor);
      return {
        ...(await preview(tx, actor)),
        enabled: await connectedEnabled(tx),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function activateConnectedWorkspace(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const command = z
    .object({
      token: z.string().length(64),
      recoveryEvidence: z.string().trim().min(10).max(2000),
    })
    .strict()
    .parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201622)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201615)`);
    await tx.execute(
      sql`SELECT id FROM workspace_setting WHERE id='primary' FOR UPDATE`,
    );
    await tx.execute(
      sql`SELECT id FROM connected_workspace WHERE id='primary' FOR UPDATE`,
    );
    if (await connectedEnabled(tx))
      return { enabled: true, alreadyActivated: true };
    for (const name of sources)
      await tx.execute(
        sql`LOCK TABLE ${sql.identifier(name)} IN EXCLUSIVE MODE`,
      );
    if (
      (
        await tx.execute(
          sql`SELECT 1 FROM calendar_job WHERE lease_until>now() LIMIT 1`,
        )
      ).rows.length
    )
      throw new AppError(
        "Calendar workers are still running. Drain them before cutover.",
        409,
      );
    if (
      (
        await tx.execute(
          sql`SELECT p.id FROM project p JOIN board_room_project b ON b.id=p.id LIMIT 1`,
        )
      ).rows.length
    )
      throw new AppError(
        "Legacy and Board project IDs overlap. Resolve the identity collision before cutover.",
        409,
      );
    const p = await preview(tx, actor);
    if (p.token !== command.token)
      throw new AppError(
        "Workspace changed since preview. Recheck the transition.",
        409,
      );
    for (const name of sources) {
      const id = [
        "task_dependency",
        "calendar_job",
        "calendar_event",
        "calendar_task_preference",
      ].includes(name)
        ? sql`md5(to_jsonb(t)::text)`
        : sql`t.id`;
      await tx.execute(
        sql`INSERT INTO legacy_record(kind,id,data) SELECT ${name},${id},to_jsonb(t) FROM ${sql.identifier(name)} t`,
      );
    }
    await tx.execute(
      sql`INSERT INTO legacy_record(kind,id,data) SELECT 'attachment',a.id,to_jsonb(a) FROM attachment a WHERE entity_type IN ('task','project','taskDraft')`,
    );
    const archived = (
      await tx.execute(
        sql`SELECT kind,count(*)::int n FROM legacy_record GROUP BY kind`,
      )
    ).rows;
    for (const name of sources)
      if (
        Number(archived.find((r) => r.kind === name)?.n ?? 0) !== p.counts[name]
      )
        throw new AppError(
          "Archive reconciliation failed. No changes were committed.",
          409,
        );
    // Move relational records only after the immutable archive has been reconciled. File bytes and external Calendar events remain.
    for (const name of [
      "calendar_job",
      "calendar_task_preference",
      "notification",
      "comment",
      "activity",
      "task_dependency",
      "project_expense",
      "saved_view",
      "task_template",
      "command_receipt",
      "task",
      "project",
    ])
      await tx.execute(sql`DELETE FROM ${sql.identifier(name)}`);
    await tx.execute(
      sql`UPDATE connected_workspace SET enabled=true,version=version+1,activated_at=now() WHERE id='primary'`,
    );
    await tx.execute(sql`UPDATE board_room_project SET data=data`);
    await tx.execute(
      sql`INSERT INTO legacy_record(kind,id,data) VALUES('transition','primary',${JSON.stringify({ actor: actor.email, counts: p.counts, recoveryEvidence: command.recoveryEvidence })}::jsonb)`,
    );
    await tx.execute(
      sql`UPDATE workspace_setting SET revision=revision+1 WHERE id='primary'`,
    );
    await tx.execute(sql`SELECT pg_notify('evolve_changed','transition')`);
    return { enabled: true, counts: p.counts };
  });
}
export async function readLegacy(
  actor: Actor,
  kind: "project" | "task",
  id: string,
  options: { childrenPage?: number; historyPage?: number } = {},
) {
  z.uuid().parse(id);
  const pages = z
    .object({
      childrenPage: z.number().int().min(1).default(1),
      historyPage: z.number().int().min(1).default(1),
    })
    .parse(options);
  const { db } = await database();
  await assertActorActive(db, actor);
  const record = (
    await db.execute(
      sql`SELECT data,archived_at FROM legacy_record WHERE kind=${kind} AND id=${id}`,
    )
  ).rows[0];
  if (!record) throw new AppError("Archived record not found.", 404);
  const files = await db.execute(
    sql`SELECT id,filename,size,purpose,owner_email FROM attachment WHERE entity_type=${kind} AND entity_id=${id} AND state='ready' ORDER BY created_at`,
  );
  const children =
    kind === "project"
      ? await db.execute(
          sql`SELECT id,data->>'title' AS name,count(*) OVER()::int AS total FROM legacy_record WHERE kind='task' AND data->>'project_id'=${id} ORDER BY lower(data->>'title'),id LIMIT 50 OFFSET ${(pages.childrenPage - 1) * 50}`,
        )
      : await db.execute(
          sql`SELECT id,data->>'body' AS name,count(*) OVER()::int AS total FROM legacy_record WHERE kind='comment' AND data->>'task_id'=${id} ORDER BY data->>'created_at',id LIMIT 50 OFFSET ${(pages.childrenPage - 1) * 50}`,
        );
  const history = await db.execute(
    sql`SELECT kind,id,data,count(*) OVER()::int AS total FROM legacy_record WHERE (kind='activity' AND (${kind}='task' AND data->>'task_id'=${id} OR ${kind}='project' AND (data->>'project_id'=${id} OR data->>'task_id' IN(SELECT id FROM legacy_record WHERE kind='task' AND data->>'project_id'=${id})))) OR (kind='project_expense' AND ${kind}='project' AND data->>'project_id'=${id}) ORDER BY data->>'created_at' DESC,id LIMIT 50 OFFSET ${(pages.historyPage - 1) * 50}`,
  );
  return {
    history: history.rows as unknown as {
      id: string;
      kind: string;
      data: Record<string, unknown>;
    }[],
    historyTotal: Number(history.rows[0]?.total ?? 0),
    childrenTotal: Number(children.rows[0]?.total ?? 0),
    record: record.data as Record<string, unknown>,
    archivedAt: record.archived_at,
    files: files.rows,
    children: children.rows,
  };
}
export async function listLegacy(actor: Actor, input: unknown) {
  const q = z
    .object({
      kind: z.enum(["project", "task"]).default("project"),
      q: z.string().max(200).default(""),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(input);
  const { db } = await database();
  await assertActorActive(db, actor);
  const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
  const result = await db.execute(
    sql`SELECT id,data->>'name' AS name,data->>'title' AS title,archived_at,count(*) OVER()::int AS total FROM legacy_record WHERE kind=${q.kind} AND coalesce(data->>'name',data->>'title','') ILIKE ${term} ORDER BY id LIMIT 50 OFFSET ${(q.page - 1) * 50}`,
  );
  return { items: result.rows, total: Number(result.rows[0]?.total ?? 0) };
}
