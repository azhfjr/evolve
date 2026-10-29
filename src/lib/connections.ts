import { cleanLabel, readProjectLabels } from "./labels";
import { sql } from "drizzle-orm";
import { database } from "./db";
import * as s from "./db/schema";
import { assertActorActive } from "./membership";
import { AppError } from "./permissions";
import type { Actor } from "./types";
import {
  connectionQuerySchema,
  connectionCursor,
  readConnectionCursor,
  connectionCatalogSchema,
  connectionItemsSchema,
  connectionEntitySchema,
} from "./connection-model";

// Aggregate/filter in PostgreSQL before pagination: the initial workspace's 500
// tasks must never define the boundaries of the connection map.
const entityQuery = (
  includeArchived: boolean,
  projectLabels: string,
) => sql`WITH project_labels AS (
  SELECT * FROM jsonb_to_recordset(${projectLabels}::jsonb) AS p(id text,labels jsonb)
), entities AS (
  SELECT p.id,'project' AS kind,NULL::text AS "projectId",p.name AS title,p.status,l.labels,false AS archived,p.version
  FROM project p JOIN project_labels l ON l.id=p.id
  UNION ALL
  SELECT t.id,'task' AS kind,t.project_id AS "projectId",t.title,t.status,coalesce(p.labels,'[]'::jsonb) AS labels,t.archived,t.version
  FROM task t LEFT JOIN project_labels p ON p.id=t.project_id WHERE (${includeArchived} OR NOT t.archived)
), tagged AS (
  SELECT DISTINCT e.*,label,label AS key
  FROM entities e CROSS JOIN LATERAL jsonb_array_elements_text(e.labels) AS label
)`;
export async function queryConnections(
  actor: Actor,
  parameters: URLSearchParams,
) {
  const query = connectionQuerySchema.parse(Object.fromEntries(parameters));
  let after: string;
  try {
    after = readConnectionCursor(query);
  } catch {
    throw new AppError(
      "Connection filters changed or the page cursor is invalid. Start again.",
      400,
    );
  }
  const { db } = await database();
  await assertActorActive(db, actor);
  // Canonicalize the small project metadata set with the same Unicode rules as
  // writes. PostgreSQL lower/space rules differ from JavaScript for legacy tags.
  const projects = await db
    .select({
      id: s.project.id,
      name: s.project.name,
      status: s.project.status,
      labels: s.project.labels,
      version: s.project.version,
    })
    .from(s.project);
  const projectLabels = JSON.stringify(
    projects.map((project) => ({
      id: project.id,
      labels: readProjectLabels(project.labels),
    })),
  );
  const entities = entityQuery(query.includeArchived === "true", projectLabels);
  const pattern = `%${(query.mode === "catalog" ? cleanLabel(query.q) : query.q).replace(/[\\%_]/g, "\\$&")}%`;
  if (query.mode === "catalog") {
    const grouped = sql`${entities}, groups AS (
      SELECT key,key AS label,
        count(DISTINCT id) FILTER (WHERE kind='project')::int AS "projectCount",
        count(DISTINCT id) FILTER (WHERE kind='task')::int AS "taskCount"
      FROM tagged WHERE key<>'' AND key ILIKE ${pattern} GROUP BY key
    )`;
    const [result, count] = await Promise.all([
      db.execute(
        sql`${grouped} SELECT * FROM groups WHERE key>${after} ORDER BY key LIMIT ${query.limit + 1}`,
      ),
      db.execute(sql`${grouped} SELECT count(*)::int AS total FROM groups`),
    ]);
    const groups = result.rows.slice(0, query.limit),
      last = groups.at(-1);
    return connectionCatalogSchema.parse({
      groups,
      total: count.rows[0].total,
      nextCursor:
        result.rows.length > query.limit && last
          ? connectionCursor(query, String(last.key))
          : null,
    });
  }
  if (!query.label)
    throw new AppError("Select a label to explore its connections.", 400);
  const filtered = sql`${entities}, matched AS (
    SELECT DISTINCT id,kind,"projectId",title,status,labels,archived,version FROM tagged
    WHERE key=${query.label} AND title ILIKE ${pattern}
      AND (${query.type}='all' OR kind=${query.type})
  )`;
  const [result, count] = await Promise.all([
    db.execute(
      sql`${filtered} SELECT * FROM matched WHERE (kind||':'||id)>${after} ORDER BY kind,id LIMIT ${query.limit + 1}`,
    ),
    db.execute(sql`${filtered} SELECT count(*)::int AS total FROM matched`),
  ]);
  const items = result.rows.slice(0, query.limit).map((item) =>
      connectionEntitySchema.parse({
        ...item,
        labels: readProjectLabels(item.labels as string[]),
      }),
    ),
    last = items.at(-1);
  const parentIds = new Set(
    items.filter((item) => item.kind === "task").map((item) => item.projectId),
  );
  for (const item of items)
    if (item.kind === "project") parentIds.delete(item.id);
  const parents = projects
    .filter((project) => parentIds.has(project.id))
    .map((project) =>
      connectionEntitySchema.parse({
        ...project,
        kind: "project",
        projectId: null,
        title: project.name,
        labels: readProjectLabels(project.labels),
      }),
    );
  return connectionItemsSchema.parse({
    items,
    parents,
    total: count.rows[0].total,
    nextCursor:
      result.rows.length > query.limit && last
        ? connectionCursor(query, `${last.kind}:${last.id}`)
        : null,
  });
}

export async function connectionEntity(
  actor: Actor,
  kind: "task" | "project",
  id: string,
) {
  const { db } = await database();
  await assertActorActive(db, actor);
  const result = await db.execute(
    kind === "task"
      ? sql`SELECT t.id,'task' AS kind,t.project_id AS "projectId",t.title,t.status,coalesce(p.labels,'[]'::jsonb) AS labels,t.archived,t.version FROM task t LEFT JOIN project p ON p.id=t.project_id WHERE t.id=${id}`
      : sql`SELECT id,'project' AS kind,NULL::text AS "projectId",name AS title,status,labels,false AS archived,version FROM project WHERE id=${id}`,
  );
  if (!result.rows.length)
    throw new AppError("This item no longer exists.", 404);
  return connectionEntitySchema.parse({
    ...result.rows[0],
    labels: readProjectLabels(result.rows[0].labels as string[]),
  });
}
