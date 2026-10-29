import { categoryExpression } from "./category-query";
import { regionExpression } from "./region-query";
import { sql, type SQL } from "drizzle-orm";
import type { BoardQuery } from "./model";
import { AppError } from "../permissions";
export const fileCount = sql`(SELECT count(*)::int FROM attachment f WHERE f.entity_type='boardRoomProject' AND f.entity_id=p.id AND f.state='ready' AND f.is_current)`;
export const valid = sql`(p.reviewed_revision IS NOT NULL AND p.reviewed_revision=p.document_revision AND ${fileCount}>0)`;
export function boardProjectWhere(q: BoardQuery, ignoreYear = false): SQL {
  const parts: SQL[] = [sql`TRUE`];
  if (
    (q.location && q.missingLocation) ||
    (q.region && (q.location || q.missingLocation))
  )
    throw new AppError(
      "Choose one geographic filter: region, location or missing location.",
      400,
    );
  if (!!q.customField !== !!q.customOption)
    throw new AppError("Choose both a custom field and its option.", 400);
  if (q.customField && q.customOption)
    parts.push(
      sql`p.data->'customValues'->>${q.customField}=${q.customOption}`,
    );
  if (q.region) parts.push(sql`${regionExpression()}=${q.region}`);
  if (q.location) parts.push(sql`p.data->>'location'=${q.location}`);
  if (q.missingLocation) parts.push(sql`COALESCE(p.data->>'location','')=''`);
  if (q.unit) parts.push(sql`p.data->>'unit'=${q.unit}`);
  if (q.assetCoverage)
    parts.push(
      q.assetCoverage === "linked"
        ? sql`EXISTS(SELECT 1 FROM board_asset a WHERE a.project_id=p.id)`
        : sql`NOT EXISTS(SELECT 1 FROM board_asset a WHERE a.project_id=p.id)`,
    );
  if (q.search) {
    const term = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
    parts.push(
      sql`(p.data->>'name' ILIKE ${term} OR p.external_id ILIKE ${term} OR p.data->>'location' ILIKE ${term} OR p.data->>'voltage' ILIKE ${term})`,
    );
  }
  if (q.category) parts.push(sql`${categoryExpression()}=${q.category}`);
  if (q.stage) parts.push(sql`(p.data->>'stage')::int=${Number(q.stage)}`);
  if (!ignoreYear && q.year)
    parts.push(
      q.year === "unknown"
        ? sql`(p.data->>'codYear') IS NULL`
        : sql`(p.data->>'codYear')::int=${Number(q.year)}`,
    );
  if (q.validation === "valid") parts.push(valid);
  if (q.validation === "review")
    parts.push(sql`NOT ${valid} AND ${fileCount}>0`);
  if (q.validation === "none") parts.push(sql`${fileCount}=0`);
  if (q.attention === "unassigned")
    parts.push(sql`COALESCE(trim(p.data->>'responsible'),'')=''`);
  if (q.attention === "incomplete")
    parts.push(
      sql`(COALESCE(p.data->>'category','')='' OR p.data->>'codYear' IS NULL OR p.data->>'capacity' IS NULL OR COALESCE(trim(p.data->>'unit'),'')='' OR COALESCE(trim(p.data->>'voltage'),'')='' OR COALESCE(trim(p.data->>'location'),'')='')`,
    );
  if (q.attention === "stale")
    parts.push(
      sql`COALESCE((p.data->>'completed')::boolean,false)=false AND (p.data->>'progressReviewedAt' IS NULL OR (p.data->>'progressReviewedAt')::timestamptz < CURRENT_TIMESTAMP - interval '30 days')`,
    );
  return sql.join(parts, sql` AND `);
}
