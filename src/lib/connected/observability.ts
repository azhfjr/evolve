import { sql } from "drizzle-orm";
import { ZodError } from "zod";
import { database, type Database } from "../db";
import { AppError } from "../permissions";
let lastCleanup = 0;
export async function observed<T>(
  route: string,
  work: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  let failed = false;
  try {
    return await work();
  } catch (e) {
    failed = !(
      (e instanceof AppError && e.status < 500) ||
      e instanceof ZodError
    );
    throw e;
  } finally {
    const ms = performance.now() - start;
    const flags = [
      ms <= 50,
      ms > 50 && ms <= 100,
      ms > 100 && ms <= 250,
      ms > 250 && ms <= 500,
      ms > 500 && ms <= 1000,
      ms > 1000,
    ].map(Number);
    try {
      const { db } = await database();
      await db.execute(
        sql`INSERT INTO workspace_operation_metric(route,bucket,requests,errors,b50,b100,b250,b500,b1000,over1000) VALUES(${route},date_trunc('minute',now()),1,${failed ? 1 : 0},${flags[0]},${flags[1]},${flags[2]},${flags[3]},${flags[4]},${flags[5]}) ON CONFLICT(route,bucket) DO UPDATE SET requests=workspace_operation_metric.requests+1,errors=workspace_operation_metric.errors+EXCLUDED.errors,b50=workspace_operation_metric.b50+EXCLUDED.b50,b100=workspace_operation_metric.b100+EXCLUDED.b100,b250=workspace_operation_metric.b250+EXCLUDED.b250,b500=workspace_operation_metric.b500+EXCLUDED.b500,b1000=workspace_operation_metric.b1000+EXCLUDED.b1000,over1000=workspace_operation_metric.over1000+EXCLUDED.over1000`,
      );
      if (Date.now() - lastCleanup > 60000) {
        lastCleanup = Date.now();
        await db.execute(
          sql`DELETE FROM workspace_operation_metric WHERE bucket<now()-interval '7 days'`,
        );
      }
    } catch {
      console.error("Connected operation metrics unavailable");
    }
  }
}
export async function connectedOperationMetrics(injected?: Database) {
  const db = injected ?? (await database()).db;
  const status = (
    await db.execute(
      sql`SELECT (SELECT enabled FROM connected_workspace WHERE id='primary') AS enabled,(SELECT count(*)::int FROM legacy_record) AS "archivedRecords",(SELECT count(*)::int FROM asset_import_finding WHERE NOT resolved) AS "importFindings",(SELECT count(*)::int FROM board_asset a WHERE project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM board_room_project p WHERE p.id=a.project_id)) AS "danglingAssets",(SELECT count(*)::int FROM task t WHERE (SELECT enabled FROM connected_workspace WHERE id='primary') AND (project_id IS NULL OR NOT EXISTS(SELECT 1 FROM board_room_project p WHERE p.id=t.project_id))) AS "orphanTasks"`,
    )
  ).rows[0];
  const rows = await db.execute(
    sql`SELECT route,sum(requests)::int requests,sum(errors)::int errors,sum(b50)::int b50,sum(b100)::int b100,sum(b250)::int b250,sum(b500)::int b500,sum(b1000)::int b1000,sum(over1000)::int over1000 FROM workspace_operation_metric WHERE bucket>=now()-interval '15 minutes' GROUP BY route ORDER BY route`,
  );
  return {
    status,
    requests: rows.rows.map((r) => {
      const n = Number(r.requests),
        target = Math.ceil(n * 0.95);
      let sum = 0,
        p95 = "> 1,000 ms";
      for (const [column, label] of [
        ["b50", "≤ 50 ms"],
        ["b100", "≤ 100 ms"],
        ["b250", "≤ 250 ms"],
        ["b500", "≤ 500 ms"],
        ["b1000", "≤ 1,000 ms"],
      ]) {
        sum += Number(r[column]);
        if (sum >= target) {
          p95 = label;
          break;
        }
      }
      return {
        route: String(r.route),
        requests: n,
        errors: Number(r.errors),
        p95,
      };
    }),
  };
}
