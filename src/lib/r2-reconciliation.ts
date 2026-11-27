import { sql } from "drizzle-orm";
import { database, type Database } from "./db";
import { R2_FILE_LIMIT } from "./file-management-model";
import { AppError } from "./permissions";
import { listR2Objects, r2Bucket } from "./r2-storage";

type StorageQuery = Pick<Database, "execute">;
const MAX_REPORT_AGE_HOURS = 36;

export async function requireHealthyR2(tx: StorageQuery) {
  const result = await tx.execute(sql`
    SELECT 1 FROM attachment_r2_reconciliation
    WHERE bucket=${r2Bucket()}
      AND checked_at > now() - make_interval(hours => ${MAX_REPORT_AGE_HOURS})
      AND mismatch_count=0 AND observed_bytes <= ${R2_FILE_LIMIT}
  `);
  if (!result.rows.length)
    throw new AppError(
      "Document uploads are paused while storage is verified.",
      503,
    );
}

export function compareStorageInventory(
  objects: ReadonlyMap<string, number>,
  rows: { key: string; size: number; required: boolean }[],
) {
  let observedBytes = 0;
  const expected = new Map(rows.map((row) => [row.key, row]));
  const mismatches = new Set<string>();
  for (const [key, size] of objects) {
    observedBytes += size;
    if (expected.get(key)?.size !== size) mismatches.add(key);
  }
  for (const row of rows)
    if (row.required && !objects.has(row.key)) mismatches.add(row.key);
  return { observedBytes, mismatchCount: mismatches.size };
}

export async function reconcileR2Inventory() {
  const started = new Date().toISOString();
  const objects = new Map<string, number>();
  const { db } = await database();
  try {
    for await (const { key, size } of listR2Objects()) objects.set(key, size);
  } catch {
    await saveReconciliation(db, started, {
      observedBytes: 0,
      mismatchCount: 1,
    });
    throw new Error("R2 inventory scan did not complete.");
  }
  const inventory = await db.execute(sql`
    SELECT storage_path, size, storage_provider='r2' AND state='ready' AS required
    FROM attachment WHERE storage_provider='r2' OR r2_copy_started_at IS NOT NULL
  `);
  const result = compareStorageInventory(
    objects,
    inventory.rows.map((row) => ({
      key: String(row.storage_path),
      size: Number(row.size),
      required: row.required === true,
    })),
  );
  await saveReconciliation(db, started, result);
  return result;
}

async function saveReconciliation(
  db: StorageQuery,
  started: string,
  result: ReturnType<typeof compareStorageInventory>,
) {
  await db.execute(sql`
    INSERT INTO attachment_r2_reconciliation(bucket, checked_at, observed_bytes, mismatch_count)
    VALUES (${r2Bucket()}, ${started}::timestamptz, ${result.observedBytes}, ${result.mismatchCount})
    ON CONFLICT (bucket) DO UPDATE SET checked_at=EXCLUDED.checked_at,
      observed_bytes=EXCLUDED.observed_bytes, mismatch_count=EXCLUDED.mismatch_count
    WHERE EXCLUDED.checked_at >= attachment_r2_reconciliation.checked_at
  `);
}
