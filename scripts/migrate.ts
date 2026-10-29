import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
async function main() {
  const { db, close } = await database();
  try {
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS evolve_migration (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamp NOT NULL DEFAULT now())`,
    );
    for (const name of (await readdir("migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      const source = await readFile(`migrations/${name}`, "utf8");
      const hash = createHash("sha256").update(source).digest("hex");
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(48201601)`);
        const applied = await tx.execute(
          sql`SELECT hash FROM evolve_migration WHERE name=${name}`,
        );
        const rows = (applied as unknown as { rows: { hash: string }[] }).rows;
        if (rows[0]) {
          if (rows[0].hash !== hash)
            throw new Error(`Migration ${name} changed after application`);
          console.log(`Already applied: ${name}`);
          return;
        }
        for (const statement of source
          .split("-- statement-breakpoint")
          .map((x) => x.trim())
          .filter(Boolean))
          await tx.execute(sql.raw(statement));
        await tx.execute(
          sql`INSERT INTO evolve_migration(name,hash) VALUES (${name},${hash})`,
        );
        console.log(`Applied: ${name}`);
      });
    }
  } finally {
    await close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
