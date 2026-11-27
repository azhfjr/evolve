import { verifyStoredBytes } from "./storage-integrity";
import { BlobNotFoundError, del, get } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { database } from "./db";
import { attachment } from "./db/schema";
import { r2Head, r2PutImmutable, r2Read } from "./r2-storage";

const BLOB_RETENTION_DAYS = 14;
type Transaction = Parameters<
  Parameters<Awaited<ReturnType<typeof database>>["db"]["transaction"]>[0]
>[0];

async function lockReadyBlob(tx: Transaction, id: string) {
  const [item] = await tx
    .select()
    .from(attachment)
    .where(
      and(
        eq(attachment.id, id),
        eq(attachment.storageProvider, "blob"),
        eq(attachment.state, "ready"),
      ),
    )
    .for("update");
  return item;
}

const copyIo = {
  readBlob: async (key: string) => {
    const source = await get(key, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(30000),
    });
    if (!source?.stream) throw new Error("Source Blob is unavailable.");
    return source.stream;
  },
  writeR2: r2PutImmutable,
  headR2: r2Head,
  readR2: r2Read,
};
type CopyIo = {
  readBlob: typeof copyIo.readBlob;
  writeR2: typeof r2PutImmutable;
  headR2: (
    key: string,
  ) => Promise<{ ContentLength?: number; ContentType?: string }>;
  readR2: typeof r2Read;
};

export async function migrateReadyBlob(id: string, io: CopyIo = copyIo) {
  const { db } = await database();
  // Persist intent before creating an object so a crash or concurrent deletion
  // cannot strand bytes that no attachment row knows about.
  const marked = await db.transaction(async (tx) => {
    const item = await lockReadyBlob(tx, id);
    if (!item) return false;
    if (!item.r2CopyStartedAt)
      await tx
        .update(attachment)
        .set({ r2CopyStartedAt: new Date() })
        .where(eq(attachment.id, id));
    return true;
  });
  if (!marked) return null;
  return db.transaction(async (tx) => {
    // A reader can keep using Blob while we copy. Deletion must wait for this
    // row lock, then re-read the current provider and copy markers.
    const item = await lockReadyBlob(tx, id);
    if (!item) return null;
    const original = await verifyStoredBytes(
      await io.readBlob(item.storagePath),
      item.size,
    );
    await io.writeR2(item.storagePath, original.bytes, item.contentType);
    const destination = await io.headR2(item.storagePath);
    if (
      destination.ContentLength !== item.size ||
      destination.ContentType !== item.contentType
    )
      throw new Error("Destination metadata does not match the attachment.");
    const verified = await verifyStoredBytes(
      await io.readR2(item.storagePath),
      item.size,
    );
    if (original.sha256 !== verified.sha256)
      throw new Error("Destination checksum mismatch.");
    await tx
      .update(attachment)
      .set({
        storageProvider: "r2",
        storageSha256: verified.sha256,
        blobRetainedUntil: new Date(
          Date.now() + BLOB_RETENTION_DAYS * 86400000,
        ),
      })
      .where(eq(attachment.id, id));
    return { id, bytes: item.size, sha256: verified.sha256 };
  });
}

export async function restoreRetainedBlob(id: string) {
  const { db } = await database();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(attachment)
      .where(
        and(
          eq(attachment.id, id),
          eq(attachment.state, "ready"),
          eq(attachment.storageProvider, "r2"),
        ),
      )
      .for("update");
    if (!item?.blobRetainedUntil || !item.storageSha256)
      throw new Error(
        "No verified retained Blob is available for this attachment.",
      );
    const source = await get(item.storagePath, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(30000),
    });
    if (!source?.stream || source.blob.contentType !== item.contentType)
      throw new Error("Retained Blob is missing or has different metadata.");
    const verified = await verifyStoredBytes(source.stream, item.size);
    if (verified.sha256 !== item.storageSha256)
      throw new Error("Retained Blob checksum mismatch.");
    await tx
      .update(attachment)
      .set({ storageProvider: "blob", blobRetainedUntil: null })
      .where(eq(attachment.id, id));
    return { id, bytes: item.size, sha256: verified.sha256 };
  });
}

export async function backfillLegacyBlobProviders() {
  const { db } = await database();
  const result = await db.execute(sql`
    UPDATE attachment SET storage_provider='blob' WHERE storage_provider IS NULL
  `);
  return result.rowCount;
}

export async function purgeRetainedBlobs(limit: number) {
  const { db } = await database();
  const candidates = await db.execute(sql`
    SELECT id FROM attachment WHERE storage_provider='r2' AND state='ready'
      AND blob_retained_until <= now() ORDER BY blob_retained_until, id LIMIT ${limit}
  `);
  let removed = 0;
  for (const candidate of candidates.rows) {
    await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(attachment)
        .where(
          and(
            eq(attachment.id, String(candidate.id)),
            eq(attachment.state, "ready"),
            eq(attachment.storageProvider, "r2"),
            sql`${attachment.blobRetainedUntil} <= now()`,
          ),
        )
        .for("update");
      if (!item) return;
      const verified = await verifyStoredBytes(
        await r2Read(item.storagePath),
        item.size,
      );
      if (verified.sha256 !== item.storageSha256)
        throw new Error(
          "Retained Blob cannot be deleted because R2 verification failed.",
        );
      try {
        await del(item.storagePath, {
          abortSignal: AbortSignal.timeout(15000),
        });
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
      }
      await tx
        .update(attachment)
        .set({ blobRetainedUntil: null })
        .where(eq(attachment.id, item.id));
      removed++;
    });
  }
  return removed;
}
