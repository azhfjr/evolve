import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../src/lib/db";
import {
  backfillLegacyBlobProviders,
  migrateReadyBlob,
  purgeRetainedBlobs,
  restoreRetainedBlob,
} from "../src/lib/r2-migration";
import { reconcileR2Inventory } from "../src/lib/r2-reconciliation";
import { r2Bucket } from "../src/lib/r2-storage";

async function main() {
  const [action, batch = "10"] = process.argv.slice(2);
  const limit = Number(batch);
  if (
    ![
      "status",
      "reconcile",
      "backfill",
      "copy",
      "retire",
      "restore-read",
    ].includes(action) ||
    (action !== "restore-read" &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100))
  )
    throw new Error(
      "Usage: tsx scripts/r2-migrate.ts status|reconcile|backfill|copy|retire [1–100] or restore-read <attachment-id>",
    );
  if (!process.env.DATABASE_URL)
    throw new Error("Select the target PostgreSQL database explicitly.");
  if (action !== "status") {
    const targetDb = new URL(process.env.DATABASE_URL);
    if (
      process.env.EVOLVE_R2_EXPECTED_DATABASE !==
      targetDb.host + targetDb.pathname
    )
      throw new Error(
        "Confirm PostgreSQL host and database in EVOLVE_R2_EXPECTED_DATABASE.",
      );
    if (process.env.EVOLVE_R2_EXPECTED_BUCKET !== r2Bucket())
      throw new Error(
        "Confirm the exact R2 account endpoint and bucket in EVOLVE_R2_EXPECTED_BUCKET.",
      );
    if (process.env.EVOLVE_R2_OPERATOR_APPROVED !== "1")
      throw new Error(
        "Set EVOLVE_R2_OPERATOR_APPROVED=1 for the reviewed target.",
      );
  }
  if (
    ["backfill", "copy", "retire", "restore-read"].includes(action) &&
    !process.env.BLOB_READ_WRITE_TOKEN
  )
    throw new Error("The legacy private Blob store must be configured.");
  const { db, close } = await database();
  try {
    if (action === "status") {
      const report = await db.execute(sql`
        SELECT coalesce(storage_provider, 'legacy') AS provider, state,
          count(*)::int AS files, sum(size)::bigint AS bytes,
          count(*) FILTER (WHERE storage_sha256 IS NOT NULL)::int AS verified
        FROM attachment GROUP BY 1, 2 ORDER BY 1, 2
      `);
      console.log(JSON.stringify(report.rows));
    } else if (action === "reconcile") {
      const result = await reconcileR2Inventory();
      console.log(JSON.stringify(result));
      if (result.mismatchCount) process.exitCode = 1;
    } else if (action === "backfill") {
      console.log(
        JSON.stringify({ backfilled: await backfillLegacyBlobProviders() }),
      );
    } else if (action === "copy") {
      const candidates = await db.execute(sql`
        SELECT id FROM attachment WHERE storage_provider='blob' AND state='ready' ORDER BY id LIMIT ${limit}
      `);
      for (const row of candidates.rows) {
        const id = String(row.id);
        try {
          const copied = await migrateReadyBlob(id);
          if (copied)
            console.log(JSON.stringify({ status: "verified", ...copied }));
        } catch (error) {
          console.error(
            JSON.stringify({
              id,
              status: "failed",
              error: error instanceof Error ? error.name : "UnknownError",
            }),
          );
          process.exitCode = 1;
        }
      }
    } else if (action === "restore-read") {
      if (process.env.EVOLVE_STORAGE_WRITE_MODE !== "paused")
        throw new Error(
          "Pause uploads before restoring a retained Blob reference.",
        );
      console.log(
        JSON.stringify(await restoreRetainedBlob(z.uuid().parse(batch))),
      );
    } else {
      if (process.env.EVOLVE_R2_ROLLBACK_DRILL_VERIFIED !== "1")
        throw new Error(
          "Record the completed rollback drill before retiring Blob copies.",
        );
      const check = await reconcileR2Inventory();
      if (check.mismatchCount)
        throw new Error(
          "Reconciliation must pass before retiring Blob copies.",
        );
      const remaining = await db.execute(sql`
        SELECT 1 FROM attachment WHERE state='ready' AND storage_provider IS DISTINCT FROM 'r2' LIMIT 1
      `);
      if (remaining.rows.length)
        throw new Error("Ready attachments are still present outside R2.");
      console.log(JSON.stringify({ retired: await purgeRetainedBlobs(limit) }));
    }
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Storage migration command failed.",
  );
  process.exitCode = 1;
});
