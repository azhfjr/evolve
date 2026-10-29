import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
export type Database = NodePgDatabase<typeof schema>;
type DatabaseState = { db: Database; close: () => Promise<void> };
const globalDb = globalThis as unknown as { evolveDb?: Promise<DatabaseState> };
export async function database(): Promise<DatabaseState> {
  if (!globalDb.evolveDb)
    globalDb.evolveDb = (async () => {
      if (process.env.VERCEL && !process.env.DATABASE_URL)
        throw new Error("Managed PostgreSQL is required on Vercel");
      if (process.env.DATABASE_URL) {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 5,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 20000,
        });
        // Managed databases can close idle connections while scaling down.
        // pg removes that client; handle its event so the process can reconnect.
        pool.on("error", (error: Error) => {
          console.error("PostgreSQL idle connection error", error.name);
        });
        return { db: drizzle(pool, { schema }), close: () => pool.end() };
      }
      if (
        process.env.NODE_ENV === "production" &&
        process.env.EVOLVE_LOCAL_DATABASE !== "1"
      )
        throw new Error("DATABASE_URL is required in production");
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle: localDrizzle } = await import("drizzle-orm/pglite");
      const dataDir = process.env.EVOLVE_DATA_DIR || ".data/postgres";
      const { mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(dataDir), { recursive: true });
      const client = new PGlite(dataDir);
      await client.waitReady;
      return {
        db: localDrizzle(client, { schema }) as unknown as Database,
        close: () => client.close(),
      };
    })().catch((error) => {
      globalDb.evolveDb = undefined;
      throw error;
    });
  return globalDb.evolveDb;
}
