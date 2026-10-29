import { config } from "dotenv";
import { Client } from "pg";
import { spawnSync } from "node:child_process";
config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Run npm run db:local first, or provide a local DATABASE_URL.",
    );
  const url = new URL(process.env.DATABASE_URL);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error(
      "Automatic test database creation is restricted to localhost.",
    );
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    for (const name of ["evolve_test", "evolve_e2e"]) {
      const found = await client.query(
        "SELECT datname FROM pg_database WHERE datname=$1",
        [name],
      );
      if (!found.rowCount) await client.query(`CREATE DATABASE ${name}`);
      const target = new URL(url);
      target.pathname = `/${name}`;
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/migrate.ts"],
        {
          stdio: "inherit",
          env: { ...process.env, DATABASE_URL: target.toString() },
        },
      );
      if (result.status !== 0) throw new Error(`Migration failed for ${name}`);
      console.log(`${name} is prepared`);
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
