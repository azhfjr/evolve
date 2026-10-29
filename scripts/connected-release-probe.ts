import { Client } from "pg";
import { createHash } from "node:crypto";
async function main() {
  if (process.env.VERCEL_PROJECT_ID !== "prj_4Cvh0pTUBDKUvva5eE9GmNLFcNie")
    throw Error("Wrong deployment project");
  const value =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL;
  if (!value) throw Error("Production database is not configured");
  const db = new Client({
    connectionString: value,
    connectionTimeoutMillis: 15000,
  });
  await db.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const identity = (
      await db.query(
        "SELECT current_database() AS database,(SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS can_create_database,current_setting('server_version') AS version",
      )
    ).rows[0];
    const tables = (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    const counts: Record<string, number> = {};
    for (const row of tables) {
      const n = String(row.tablename);
      if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw Error("Unexpected table name");
      counts[n] = Number(
        (await db.query(`SELECT count(*)::int n FROM public.\"${n}\"`)).rows[0]
          .n,
      );
    }
    const files = (
      await db.query(
        "SELECT state,count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM attachment GROUP BY state ORDER BY state",
      )
    ).rows;
    const migrations = (
      await db.query("SELECT name FROM evolve_migration ORDER BY name")
    ).rows.map((r) => r.name);
    await db.query("ROLLBACK");
    console.log(
      "EVOLVE_RELEASE_PROBE " +
        JSON.stringify({
          databaseHash: createHash("sha256")
            .update(identity.database)
            .digest("hex"),
          serverVersion: identity.version,
          canCreateDatabase: identity.can_create_database,
          counts,
          files,
          migrations,
        }),
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(
    "EVOLVE_RELEASE_PROBE_FAILED",
    e instanceof Error ? e.name : "unknown",
  );
  process.exitCode = 1;
});
