import { querySchema } from "../board-room/model";
import { boardProjectWhere } from "../board-room/project-query";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { requireAdmin } from "../permissions";
import type { Actor } from "../types";
export type QualityIssue = {
  version?: number;
  id: string;
  kind: string;
  name: string;
  reason: string;
  href: string;
};
export async function assetQuality(actor: Actor, page = 1) {
  requireAdmin(actor);
  page = z.number().int().min(1).parse(page);
  const { db } = await database();
  await assertActorActive(db, actor);
  const issues = sql`WITH totals AS (SELECT project_id,data->>'unit' AS unit,sum((data->>'capacity')::numeric) AS capacity FROM board_asset WHERE data->>'capacity' IS NOT NULL GROUP BY 1,2),issues AS (
 SELECT a.id,'unassigned' AS kind,a.data->>'name' AS name,'Asset has no connected project.' AS reason,'/board-room?section=assets&asset='||a.id AS href FROM board_asset a WHERE project_id IS NULL
 UNION ALL SELECT a.id,'incomplete',a.data->>'name','Complete the asset category, location, voltage or capacity/unit.','/board-room?section=assets&asset='||a.id FROM board_asset a WHERE coalesce(a.data->>'category','')='' OR coalesce(a.data->>'location','')='' OR coalesce(a.data->>'voltage','')='' OR a.data->>'capacity' IS NULL OR coalesce(a.data->>'unit','')=''
 UNION ALL SELECT a.id,'possible_duplicate',a.data->>'name','Another asset shares this name, category and location. Review; no automatic merge.','/board-room?section=assets&asset='||a.id FROM board_asset a WHERE EXISTS(SELECT 1 FROM board_asset b WHERE b.id<>a.id AND lower(trim(b.data->>'name'))=lower(trim(a.data->>'name')) AND b.data->>'category'=a.data->>'category' AND b.data->>'location'=a.data->>'location')
 UNION ALL SELECT p.id,'capacity_difference',p.data->>'name','Project capacity '||(p.data->>'capacity')||' '||(p.data->>'unit')||' differs from linked asset total '||t.capacity::text||' '||t.unit||'. Figures remain independent.','/board-room/projects/'||p.id FROM board_room_project p JOIN totals t ON t.project_id=p.id AND t.unit=p.data->>'unit' WHERE p.data->>'capacity' IS NOT NULL AND (p.data->>'capacity')::numeric<>t.capacity
 UNION ALL SELECT a.id,'relationship_inconsistency',a.data->>'name','Connected project is unavailable. Review this asset assignment.','/board-room?section=assets&asset='||a.id FROM board_asset a WHERE a.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM board_room_project p WHERE p.id=a.project_id)
 UNION ALL SELECT t.id,'relationship_inconsistency',t.title,'Active task has no canonical project. Review its project connection.','/app?section=tasks&task='||t.id FROM task t WHERE (SELECT enabled FROM connected_workspace WHERE id='primary') AND (t.project_id IS NULL OR NOT EXISTS(SELECT 1 FROM board_room_project p WHERE p.id=t.project_id))
 UNION ALL SELECT id,'import_conflict','Asset CSV import',message,'/board-room?section=assets&import=1' FROM asset_import_finding WHERE NOT resolved
 )`;
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute(
        sql`${issues} SELECT *,CASE WHEN kind='import_conflict' THEN (SELECT version FROM asset_import_finding f WHERE f.id=issues.id) ELSE NULL END AS version,count(*) OVER()::int AS total FROM issues ORDER BY kind,id LIMIT 100 OFFSET ${(page - 1) * 100}`,
      );
      const total = await tx.execute(
        sql`${issues} SELECT count(*)::int AS n FROM issues`,
      );
      return {
        checkedAt: new Date().toISOString(),
        issues: rows.rows as unknown as QualityIssue[],
        total: Number(total.rows[0].n),
        page,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export type ConnectionProject = {
  id: string;
  name: string;
  category: string;
  codYear: number | null;
  assetCount: number;
};
export async function assetConnections(actor: Actor, input: unknown) {
  const q = z
    .object({
      overview: z.preprocess((v) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v);
        } catch {
          return null;
        }
      }, querySchema.optional()),
      q: z.string().max(200).default(""),
      projectId: z.uuid().optional(),
      year: z.coerce.number().int().min(1900).max(2200).optional(),
      category: z.string().max(60).default(""),
      assetCategory: z.string().max(60).default(""),
      location: z.string().max(160).default(""),
      voltage: z.string().max(120).default(""),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(input);
  const { db } = await database();
  await assertActorActive(db, actor);
  const where: SQL[] = [sql`TRUE`],
    assets: SQL[] = [sql`a.project_id=p.id`];
  if (q.overview) where.push(boardProjectWhere(q.overview));
  if (q.q) {
    const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
    where.push(
      sql`(p.data->>'name' ILIKE ${term} OR p.external_id ILIKE ${term})`,
    );
  }
  if (q.projectId) where.push(sql`p.id=${q.projectId}`);
  if (q.year) where.push(sql`(p.data->>'codYear')::int=${q.year}`);
  if (q.category) where.push(sql`p.data->>'category'=${q.category}`);
  for (const [field, val] of [
    ["category", q.assetCategory],
    ["location", q.location],
    ["voltage", q.voltage],
  ])
    if (val) assets.push(sql`a.data->>${field}=${val}`);
  const child = sql.join(assets, sql` AND `);
  if (assets.length > 1)
    where.push(sql`EXISTS(SELECT 1 FROM board_asset a WHERE ${child})`);
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute(
        sql`SELECT p.id,p.data->>'name' AS name,p.data->>'category' AS category,(p.data->>'codYear')::int AS "codYear",(SELECT count(*)::int FROM board_asset a WHERE ${child}) AS "assetCount",count(*) OVER()::int AS total FROM board_room_project p WHERE ${sql.join(where, sql` AND `)} ORDER BY lower(p.data->>'name'),p.id LIMIT 25 OFFSET ${(q.page - 1) * 25}`,
      );
      const totals = await tx.execute(
        sql`SELECT count(*)::int AS total,coalesce(sum((SELECT count(*) FROM board_asset a WHERE ${child})),0)::int AS assets FROM board_room_project p WHERE ${sql.join(where, sql` AND `)}`,
      );
      const initialAssets = rows.rows.length
        ? await tx.execute(
            sql`SELECT a.id,a.project_id AS "projectId",a.code,a.data->>'name' AS name,a.data->>'category' AS category FROM board_asset a JOIN board_room_project p ON p.id=a.project_id WHERE p.id IN (${sql.join(
              rows.rows.map((r) => sql`${r.id}`),
              sql`,`,
            )}) AND ${child} ORDER BY a.code LIMIT 200`,
          )
        : { rows: [] };
      const unassigned = await tx.execute(
        sql`SELECT count(*)::int AS n FROM board_asset a WHERE ${sql.join([sql`a.project_id IS NULL`, ...assets.slice(1)], sql` AND `)}`,
      );
      return {
        projects: rows.rows as unknown as ConnectionProject[],
        total: Number(totals.rows[0].total),
        assetTotal: Number(totals.rows[0].assets),
        assets: initialAssets.rows as unknown as {
          id: string;
          projectId: string;
          code: string;
          name: string;
          category: string;
        }[],
        unassigned: Number(unassigned.rows[0].n),
        page: q.page,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
