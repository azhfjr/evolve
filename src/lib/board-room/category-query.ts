import { sql, type SQL } from "drizzle-orm";
// Existing project contracts admit these exact canonical values and an empty
// category. Historical unknown values stay visible; no speculative alias mapping.
export function categoryExpression(value: SQL = sql`p.data->>'category'`) {
  return sql`CASE WHEN ${value} IN ('Pembangkit','Transmisi','Gardu Induk') THEN ${value} ELSE 'uncategorized' END`;
}
