import { categoryExpression } from "./category-query";
import { MAP_CATEGORIES, PROVINCES, type Region } from "./regions";
import { regionExpression } from "./region-query";
import { sql } from "drizzle-orm";
import type { database } from "../db";
import type { BoardQuery, DashboardAnalytics } from "./model";
import { boardProjectWhere, fileCount, valid } from "./project-query";
type DB = Awaited<ReturnType<typeof database>>["db"];
type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
export async function dashboardAnalytics(
  tx: TX,
  query: BoardQuery,
): Promise<DashboardAnalytics> {
  const scope = sql`WITH projects AS (SELECT p.*,${fileCount} AS files,${valid} AS valid FROM board_room_project p WHERE ${boardProjectWhere(query)}), assets AS (SELECT a.*,p.data->>'codYear' AS year FROM board_asset a JOIN projects p ON p.id=a.project_id)`;
  const evidence = await tx.execute(
    sql`${scope} SELECT CASE WHEN data->>'category' IN ('Pembangkit','Transmisi','Gardu Induk') THEN data->>'category' ELSE '' END AS category,count(*) FILTER(WHERE valid)::int AS valid,count(*) FILTER(WHERE NOT valid AND files>0)::int AS review,count(*) FILTER(WHERE files=0)::int AS none FROM projects GROUP BY 1 ORDER BY 1`,
  );
  const categories = await tx.execute(
    sql`${scope} SELECT data->>'category' AS category,count(*)::int AS count FROM assets GROUP BY 1 ORDER BY 1`,
  );
  const locations = await tx.execute(
    sql`${scope} SELECT nullif(data->>'location','') AS location,count(*)::int AS count FROM projects GROUP BY 1 ORDER BY count DESC,location NULLS LAST`,
  );
  const counts = await tx.execute(
    sql`${scope} SELECT (SELECT count(*)::int FROM assets) AS assets,(SELECT count(*)::int FROM projects p WHERE EXISTS(SELECT 1 FROM assets a WHERE a.project_id=p.id)) AS linked,(SELECT count(*)::int FROM projects) AS projects,(SELECT count(*)::int FROM board_asset WHERE project_id IS NULL) AS unassigned,(SELECT count(*)::int FROM projects WHERE data->>'capacity' IS NULL) AS missing_projects,(SELECT count(*)::int FROM assets WHERE data->>'capacity' IS NULL) AS missing_assets`,
  );
  const capacity = await tx.execute(
    sql`${scope} SELECT 'project' AS source,(data->>'codYear')::int AS year,coalesce(data->>'unit','') AS unit,sum((data->>'capacity')::numeric)::text AS total,count(*)::int AS "measuredCount" FROM projects WHERE data->>'capacity' IS NOT NULL GROUP BY 2,3 UNION ALL SELECT 'asset',year::int,coalesce(data->>'unit',''),sum((data->>'capacity')::numeric)::text,count(*)::int FROM assets WHERE data->>'capacity' IS NOT NULL GROUP BY 2,3 ORDER BY source,unit,year NULLS LAST`,
  );
  const regionalRows = await tx.execute(sql`
    WITH regional_scope AS (
      SELECT p.id, ${categoryExpression()} AS category, ${regionExpression()} AS region, (${boardProjectWhere(query)}) AS matches
      FROM board_room_project p
      WHERE ${boardProjectWhere({ ...query, region: "", location: "", missingLocation: false })}
    ) SELECT region,category,count(DISTINCT id)::int AS context,count(DISTINCT id) FILTER (WHERE matches)::int AS matching
    FROM regional_scope GROUP BY region,category`);
  const regional = (region: Region) => {
    const rows = regionalRows.rows.filter((r) => r.region === region);
    return {
      contextCount: rows.reduce((n, r) => n + Number(r.context), 0),
      matchingCount: rows.reduce((n, r) => n + Number(r.matching), 0),
      categories: MAP_CATEGORIES.map((category) => {
        const row = rows.find((r) => r.category === category);
        return {
          category,
          contextCount: Number(row?.context ?? 0),
          matchingCount: Number(row?.matching ?? 0),
        };
      }),
    };
  };
  const c = counts.rows[0];
  return {
    regions: {
      contextTotal: regionalRows.rows.reduce(
        (n, r) => n + Number(r.context),
        0,
      ),
      matchingTotal: Number(c.projects),
      provinces: PROVINCES.map((p) => ({
        code: p.code,
        name: p.name,
        ...regional(p.code),
      })),
      missing: regional("missing"),
      unrecognized: regional("unrecognized"),
    },
    linkedAssets: Number(c.assets),
    evidence: evidence.rows as DashboardAnalytics["evidence"],
    assetCategories: categories.rows as DashboardAnalytics["assetCategories"],
    locations: locations.rows as DashboardAnalytics["locations"],
    capacity: capacity.rows as DashboardAnalytics["capacity"],
    coverage: {
      linked: Number(c.linked),
      unlinked: Number(c.projects) - Number(c.linked),
      unassignedPortfolioAssets: Number(c.unassigned),
    },
    missingCapacity: {
      projects: Number(c.missing_projects),
      assets: Number(c.missing_assets),
    },
  };
}
