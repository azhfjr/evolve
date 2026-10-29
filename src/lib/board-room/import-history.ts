import { sql } from "drizzle-orm";
import { database } from "../db";
import { assertActorActive } from "../membership";
import type { Actor } from "../types";
export type ImportBatch = {
  id: string;
  actor: string;
  createdAt: string;
  counts: { new: number; updated: number; unchanged: number } | null;
  totalRows: number | null;
  updateStages: boolean;
  recordedProjects: number;
  legacy: boolean;
};
export async function boardImportHistory(
  actor: Actor,
): Promise<{ batches: ImportBatch[] }> {
  const { db } = await database();
  await assertActorActive(db, actor);
  const result = await db.execute(sql`SELECT
    coalesce(h.detail->>'batchId',h.id::text) AS id,
    h.actor,
    min(h.created_at) AS created_at,
    max((h.detail->'counts'->>'new')::int) AS new_count,
    max((h.detail->'counts'->>'updated')::int) AS updated_count,
    max((h.detail->'counts'->>'unchanged')::int) AS unchanged_count,
    max((h.detail->>'totalRows')::int) AS total_rows,
    bool_or(coalesce((h.detail->>'updateStages')::boolean,false)) AS update_stages,
    count(DISTINCT h.project_id)::int AS recorded_projects,
    bool_and(h.detail->>'batchId' IS NULL) AS legacy
    FROM board_room_history h WHERE h.kind='csv_import'
    GROUP BY 1,2 ORDER BY min(h.created_at) DESC,1 DESC LIMIT 25`);
  return {
    batches: result.rows.map((row) => ({
      id: String(row.id),
      actor: String(row.actor),
      createdAt: new Date(row.created_at as string).toISOString(),
      counts:
        row.new_count === null
          ? null
          : {
              new: Number(row.new_count),
              updated: Number(row.updated_count),
              unchanged: Number(row.unchanged_count),
            },
      totalRows: row.total_rows === null ? null : Number(row.total_rows),
      updateStages: Boolean(row.update_stages),
      recordedProjects: Number(row.recorded_projects),
      legacy: Boolean(row.legacy),
    })),
  };
}
