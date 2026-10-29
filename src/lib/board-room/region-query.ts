import { sql, type SQL } from "drizzle-orm";
import { PROVINCES, provinceAliases } from "./regions";
/** Parameterized cases generated from the same registry used by the client. */
export function regionExpression(
  location: SQL = sql`p.data->>'location'`,
): SQL {
  const normalized = sql`regexp_replace(lower(coalesce(${location},'')), '[[:space:]_.-]+', '', 'g')`;
  const cases = PROVINCES.map(
    (p) =>
      sql`WHEN ${normalized} IN (${sql.join(
        provinceAliases(p).map((a) => sql`${a}`),
        sql`,`,
      )}) THEN ${p.code}`,
  );
  return sql`CASE WHEN regexp_replace(coalesce(${location},''), '[[:space:]]+', '', 'g')='' THEN 'missing' ${sql.join(cases, sql` `)} ELSE 'unrecognized' END`;
}
