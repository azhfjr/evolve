import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import type { Actor } from "../types";
import { querySchema } from "./model";
import { boardProjectWhere, fileCount, valid } from "./project-query";
import { regionExpression } from "./region-query";
export const attentionSchema = z.object({
  overview: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }, querySchema.optional()),
  tab: z.enum(["attention", "reviews", "regions"]).default("attention"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  attention: z.enum(["", "stale", "incomplete", "unassigned"]).default(""),
});
export type AttentionProject = {
  id: string;
  name: string;
  location: string;
  region: string;
  version: number;
  reasons: string[];
  files: number;
  valid: boolean;
};
export async function projectAttention(actor: Actor, input: unknown) {
  const q = attentionSchema.parse(input),
    { db } = await database();
  await assertActorActive(db, actor);
  const reason = (attention: "stale" | "incomplete" | "unassigned") =>
    boardProjectWhere(querySchema.parse({ attention }));
  const source = sql`WITH candidates AS (SELECT p.id,p.version,p.data->>'name' AS name,coalesce(p.data->>'location','') AS location,${regionExpression()} AS region,${fileCount} AS files,${valid} AS valid, array_remove(ARRAY[CASE WHEN ${reason("stale")} THEN 'Progress review due (30-day policy).' END,CASE WHEN ${reason("incomplete")} THEN 'Required project information is missing.' END,CASE WHEN ${reason("unassigned")} THEN 'Responsible contact is not assigned.' END],NULL) AS reasons FROM board_room_project p WHERE ${boardProjectWhere(q.overview ?? querySchema.parse({}))}), matches AS (SELECT * FROM candidates WHERE ${q.tab === "reviews" ? sql`files>0 AND NOT valid` : q.tab === "regions" ? sql`region IN ('missing','unrecognized')` : q.attention ? sql`id IN (SELECT p.id FROM board_room_project p WHERE ${reason(q.attention)})` : sql`cardinality(reasons)>0`})`;
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute(
        sql`${source} SELECT * FROM matches ORDER BY name,id LIMIT 50 OFFSET ${(q.page - 1) * 50}`,
      );
      const total = await tx.execute(
        sql`${source} SELECT count(*)::int AS n FROM matches`,
      );
      return {
        projects: rows.rows as unknown as AttentionProject[],
        total: Number(total.rows[0].n),
        page: q.page,
        limit: 50,
        checkedAt: new Date().toISOString(),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
