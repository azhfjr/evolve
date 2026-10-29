import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { get, head, del } from "@vercel/blob";
import { database, type Database } from "./db";
import * as s from "./db/schema";
import { AppError, requireAdmin } from "./permissions";
import { assertActorActive } from "./membership";
import type { Actor } from "./types";
import type { AttachmentEntity, AttachmentInfo } from "./attachment-types";
import {
  documentPurposeSchema,
  documentDateSchema,
  type DocumentPurpose,
} from "./document-model";
import { WORKSPACE_FILE_LIMIT } from "./file-management-model";
export const MAX_DOCUMENT = 25 * 1024 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_STORAGE = WORKSPACE_FILE_LIMIT;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const reservationSchema = z
  .object({
    entityType: z.enum([
      "task",
      "taskDraft",
      "project",
      "boardRoomProject",
      "avatar",
      "workspace",
    ]),
    entityId: z.string().min(1).max(254),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((v) => !/[\x00-\x1f\x7f/\\]/.test(v), "Nama file tidak valid."),
    contentType: z.string().max(150),
    size: z.number().int().positive().max(MAX_DOCUMENT),
    purpose: documentPurposeSchema.optional(),
    documentDate: documentDateSchema.nullable().optional(),
    replaceDocumentId: z.uuid().optional(),
    expectedCurrentId: z.uuid().optional(),
    requestId: z.uuid().optional(),
  })
  .strict();
type Attachment = typeof s.attachment.$inferSelect;
export function storageProvider(): "local" | "blob" | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (
    !process.env.VERCEL &&
    (process.env.NODE_ENV !== "production" ||
      process.env.EVOLVE_LOCAL_FILES === "1")
  )
    return "local";
  return null;
}
function localPath(path: string) {
  if (!/^evolve-files\/[0-9a-f-]{36}\/[a-z]+$/.test(path))
    throw new AppError("Lokasi file tidak valid.", 400);
  return resolve(process.env.EVOLVE_FILES_DIR || ".data/files", path);
}
export function attachmentDto(item: Attachment): AttachmentInfo {
  return {
    id: item.id,
    documentId: item.documentId,
    versionNumber: item.versionNumber,
    isCurrent: item.isCurrent,
    filename: item.filename,
    purpose: item.purpose as DocumentPurpose | null,
    contentType: item.contentType,
    size: item.size,
    ownerEmail: item.ownerEmail,
    createdAt: item.createdAt.toISOString(),
  };
}
export function validateFileHeader(bytes: Uint8Array, mime: string) {
  const b = Buffer.from(bytes);
  const text = b.toString("utf8");
  if (mime === "application/pdf")
    return b.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/png")
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === "image/webp")
    return (
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP"
    );
  if (mime === "text/plain")
    return (
      !b.includes(0) && !/^\s*<(?:!doctype\s+html|html|script|svg)/i.test(text)
    );
  return (
    mime.includes("openxmlformats") &&
    b[0] === 80 &&
    b[1] === 75 &&
    b[2] === 3 &&
    b[3] === 4
  );
}
async function entityAccess(
  actor: Actor,
  type: AttachmentEntity,
  id: string,
  connection?: Pick<Database, "select">,
) {
  const db = connection || (await database()).db;
  await assertActorActive(db, actor);
  if (type === "avatar") {
    if (id !== actor.email)
      throw new AppError(
        "Avatar hanya dapat diunggah untuk akun sendiri.",
        403,
      );
    return;
  }
  if (type === "workspace") {
    requireAdmin(actor);
    if (id !== "primary") throw new AppError("Workspace tidak ditemukan.", 404);
    return;
  }
  z.uuid().parse(id);
  if (type === "taskDraft") return;
  const table =
    type === "boardRoomProject"
      ? s.boardRoomProject
      : type === "task"
        ? s.task
        : s.project;
  if (
    !(await db.select({ id: table.id }).from(table).where(eq(table.id, id)))[0]
  )
    throw new AppError("Task atau project tidak ditemukan.", 404);
}
export async function reserveAttachment(actor: Actor, input: unknown) {
  const value = reservationSchema.parse(input);
  if (
    value.documentDate !== undefined &&
    (value.entityType !== "boardRoomProject" || value.replaceDocumentId)
  )
    throw new AppError(
      "Document dates apply to new project documents. Edit an existing document date through its metadata action.",
    );
  if (value.purpose && ["avatar", "workspace"].includes(value.entityType))
    throw new AppError("Purpose labels apply to documents only.", 400);
  if (value.entityType === "boardRoomProject") requireAdmin(actor);
  if (
    value.entityType === "taskDraft" &&
    process.env.EVOLVE_DISABLE_TASK_DRAFT_UPLOADS === "1"
  )
    throw new AppError(
      "Uploading before task creation is temporarily unavailable. Create the task first, then add attachments.",
      503,
    );
  const extension = value.filename.split(".").pop()?.toLowerCase() || "";
  const mime = MIME[extension];
  if (
    !mime ||
    (value.contentType &&
      value.contentType !== "application/octet-stream" &&
      value.contentType !== mime)
  )
    throw new AppError(
      "Jenis dokumen tidak didukung atau tidak cocok dengan nama file.",
      400,
    );
  if (
    ["avatar", "workspace"].includes(value.entityType) &&
    (!imageTypes.has(mime) || value.size > MAX_IMAGE)
  )
    throw new AppError(
      "Gambar harus PNG, JPEG, atau WebP, maksimal 2 MB.",
      400,
    );
  const provider = storageProvider();
  if (!provider)
    throw new AppError("Penyimpanan dokumen belum diaktifkan oleh admin.", 503);
  const { db } = await database();
  return db.transaction(async (tx) => {
    // Serialize the existence check with task/project deletion and draft claiming.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await entityAccess(actor, value.entityType, value.entityId, tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201602)`);
    const requestHash = createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex");
    if (value.requestId) {
      const receipt = (
        await tx.execute(
          sql`SELECT input_hash,attachment_id FROM attachment_upload_receipt WHERE owner_email=${actor.email} AND request_id=${value.requestId}`,
        )
      ).rows[0];
      if (receipt) {
        if (receipt.input_hash !== requestHash)
          throw new AppError(
            "Upload request changed. Choose the file again.",
            409,
          );
        const [existing] = await tx
          .select()
          .from(s.attachment)
          .where(eq(s.attachment.id, String(receipt.attachment_id)));
        if (
          !existing ||
          existing.state === "deleting" ||
          (existing.state === "ready" && !existing.isCurrent)
        )
          throw new AppError(
            "Document changed or was removed after this upload. Refresh its current version.",
            409,
          );
        return {
          id: existing.id,
          storagePath: existing.storagePath,
          provider,
          contentType: existing.contentType,
          ...(existing.state === "ready"
            ? {
                file: (
                  await withDocumentMetadata([attachmentDto(existing)], tx)
                )[0],
              }
            : {}),
        };
      }
    }
    const result = await tx.execute(
      sql`SELECT coalesce(sum(size),0)::bigint AS used FROM attachment`,
    );
    if (Number(result.rows[0].used) + value.size > MAX_STORAGE)
      throw new AppError(
        "Kuota dokumen workspace 1 GB sudah penuh. Hubungi admin.",
        409,
      );
    const recent = await tx.execute(
      sql`SELECT count(*)::int AS count FROM attachment WHERE owner_email=${actor.email} AND created_at>now()-interval '1 minute'`,
    );
    if (Number(recent.rows[0].count) >= 30)
      throw new AppError("Terlalu banyak unggahan. Coba lagi sebentar.", 429);
    const id = crypto.randomUUID();
    const storagePath = `evolve-files/${id}/${extension}`;
    let versionFields: {
      documentId?: string;
      versionNumber?: number;
      replacesAttachmentId?: string;
    } = {};
    if (value.replaceDocumentId) {
      const current = (
        await tx.execute(
          sql`SELECT * FROM logical_document WHERE id=${value.replaceDocumentId} FOR UPDATE`,
        )
      ).rows[0];
      if (
        !current ||
        current.entity_type !== value.entityType ||
        current.entity_id !== value.entityId
      )
        throw new AppError("Document not found in this project.", 404);
      const owner = (
        await tx.execute(
          sql`SELECT owner_email FROM attachment WHERE id=${current.current_attachment_id}`,
        )
      ).rows[0];
      if (!actor.isAdmin && owner?.owner_email !== actor.email)
        throw new AppError(
          "Only the uploader or administrator can replace this document.",
          403,
        );
      if (current.current_attachment_id !== value.expectedCurrentId)
        throw new AppError("Document changed. Refresh before replacing.", 409);
      const n = (
        await tx.execute(
          sql`SELECT coalesce(max(version_number),0)+1 AS n FROM attachment WHERE document_id=${value.replaceDocumentId}`,
        )
      ).rows[0].n;
      versionFields = {
        documentId: value.replaceDocumentId,
        versionNumber: Number(n),
        replacesAttachmentId: value.expectedCurrentId,
      };
    }
    const {
      replaceDocumentId,
      expectedCurrentId,
      requestId,
      documentDate,
      ...fileValue
    } = value;
    void replaceDocumentId;
    void expectedCurrentId;
    await tx.insert(s.attachment).values({
      ...fileValue,
      ...versionFields,
      id,
      contentType: mime,
      storagePath,
      ownerEmail: actor.email,
    });
    if (documentDate != null)
      await tx.execute(
        sql`UPDATE logical_document SET document_date=${documentDate}::date WHERE id=(SELECT document_id FROM attachment WHERE id=${id})`,
      );
    if (requestId)
      await tx.execute(
        sql`INSERT INTO attachment_upload_receipt(owner_email,request_id,input_hash,attachment_id) VALUES(${actor.email},${requestId},${requestHash},${id})`,
      );
    return { id, storagePath, provider, contentType: mime };
  });
}
export async function ownedReservation(actor: Actor, id: string) {
  z.uuid().parse(id);
  const { db } = await database();
  const [item] = await db
    .select()
    .from(s.attachment)
    .where(eq(s.attachment.id, id));
  if (!item || item.ownerEmail !== actor.email || item.state === "deleting")
    throw new AppError("Unggahan tidak ditemukan.", 404);
  if (item.state === "pending" && Date.now() - +item.createdAt > 3600000)
    throw new AppError(
      "Izin unggah telah kedaluwarsa. Pilih file kembali.",
      410,
    );
  if (item.entityType === "boardRoomProject") {
    requireAdmin(actor);
    await entityAccess(actor, "boardRoomProject", item.entityId);
  }
  return item;
}
export async function writeLocalAttachment(
  actor: Actor,
  id: string,
  bytes: Uint8Array,
) {
  if (storageProvider() !== "local")
    throw new AppError("Jalur unggah lokal tidak tersedia.", 404);
  const item = await ownedReservation(actor, id);
  if (item.state !== "pending")
    throw new AppError("Dokumen sudah selesai diunggah.", 409);
  if (
    bytes.length !== item.size ||
    !validateFileHeader(bytes.subarray(0, 8192), item.contentType)
  )
    throw new AppError("Isi file tidak sesuai ukuran atau jenis dokumen.", 400);
  const path = localPath(item.storagePath);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new AppError(
      "File sudah diunggah. Selesaikan unggahan yang ada.",
      409,
    );
  }
}
export async function finalizeAttachment(actor: Actor, id: string) {
  const item = await ownedReservation(actor, id);
  if (item.state === "ready") return attachmentDto(item);
  let prefix: Uint8Array;
  if (storageProvider() === "blob") {
    const metadata = await head(item.storagePath);
    if (
      metadata.size !== item.size ||
      metadata.contentType !== item.contentType
    )
      throw new AppError("Metadata unggahan tidak cocok.", 400);
    const content = await get(item.storagePath, {
      access: "private",
      useCache: false,
    });
    if (!content?.stream)
      throw new AppError("File belum tersedia. Coba lagi.", 409);
    const reader = content.stream.getReader();
    try {
      const parts: Uint8Array[] = [];
      let size = 0;
      while (size < Math.min(8192, item.size)) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parts.push(chunk.value.subarray(0, 8192 - size));
        size += parts[parts.length - 1].length;
      }
      prefix = Buffer.concat(parts);
    } finally {
      await reader.cancel();
    }
  } else {
    if (storageProvider() !== "local")
      throw new AppError("Penyimpanan dokumen belum tersedia.", 503);
    const file = await open(
      /* turbopackIgnore: true */ localPath(item.storagePath),
      "r",
    );
    try {
      const info = await file.stat();
      if (info.size !== item.size)
        throw new AppError("Ukuran file tidak cocok.", 400);
      prefix = Buffer.alloc(Math.min(8192, item.size));
      await file.read(prefix, 0, prefix.length, 0);
    } finally {
      await file.close();
    }
  }
  if (!validateFileHeader(prefix, item.contentType))
    throw new AppError("Isi file tidak cocok dengan jenis dokumen.", 400);
  const { db } = await database();
  const [ready] = await db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    if (item.replacesAttachmentId) {
      const current = (
        await tx.execute(
          sql`SELECT current_attachment_id FROM logical_document WHERE id=${item.documentId} FOR UPDATE`,
        )
      ).rows[0];
      if (current?.current_attachment_id !== item.replacesAttachmentId)
        throw new AppError(
          "Document changed during upload. Retry from its current version.",
          409,
        );
    }
    await tx
      .update(s.workspaceSetting)
      .set({ revision: sql`${s.workspaceSetting.revision}+1` })
      .where(eq(s.workspaceSetting.id, "primary"));
    await tx.execute(sql`SELECT pg_notify('evolve_changed','refresh')`);
    return tx
      .update(s.attachment)
      .set({ state: "ready" })
      .where(and(eq(s.attachment.id, id), eq(s.attachment.state, "pending")))
      .returning();
  });
  if (!ready)
    throw new AppError("Unggahan telah berubah. Muat ulang lampiran.", 409);
  return (await withDocumentMetadata([attachmentDto(ready)]))[0];
}
export async function withDocumentMetadata(
  files: AttachmentInfo[],
  connection?: Pick<Database, "execute">,
) {
  const ids = [
    ...new Set(
      files.map((f) => f.documentId).filter((id): id is string => !!id),
    ),
  ];
  if (!ids.length) return files;
  const db = connection ?? (await database()).db;
  const result = await db.execute(
    sql`SELECT id,document_date::text AS date,version FROM logical_document WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`,`,
    )})`,
  );
  const metadata = new Map(result.rows.map((row) => [String(row.id), row]));
  return files.map((file) => {
    const doc = metadata.get(file.documentId ?? "");
    return doc
      ? {
          ...file,
          documentDate: doc.date as string | null,
          documentVersion: Number(doc.version),
        }
      : file;
  });
}
export async function listAttachments(
  actor: Actor,
  type: AttachmentEntity,
  id: string,
) {
  await entityAccess(actor, type, id);
  const { db } = await database();
  const files = (
    await db
      .select()
      .from(s.attachment)
      .where(
        and(
          eq(s.attachment.entityType, type),
          eq(s.attachment.entityId, id),
          eq(s.attachment.state, "ready"),
          eq(s.attachment.isCurrent, true),
          type === "taskDraft"
            ? eq(s.attachment.ownerEmail, actor.email)
            : undefined,
          type === "taskDraft"
            ? gt(s.attachment.createdAt, new Date(Date.now() - 86400000))
            : undefined,
        ),
      )
      .orderBy(s.attachment.createdAt)
  ).map(attachmentDto);
  return withDocumentMetadata(files, db);
}
export async function readAttachment(id: string, actor?: Actor) {
  z.uuid().parse(id);
  const { db } = await database();
  const [item] = await db
    .select()
    .from(s.attachment)
    .where(and(eq(s.attachment.id, id), eq(s.attachment.state, "ready")));
  if (!item) throw new AppError("Dokumen tidak ditemukan.", 404);
  if (item.entityType === "boardRoomProject") {
    if (!actor) throw new AppError("Sign in to read this document.", 401);
    await entityAccess(actor, "boardRoomProject", item.entityId);
  }
  if (item.entityType === "taskDraft" && item.ownerEmail !== actor?.email)
    throw new AppError("Dokumen tidak ditemukan.", 404);
  if (
    item.entityType === "taskDraft" &&
    Date.now() - +item.createdAt > 86400000
  )
    throw new AppError(
      "The draft attachment has expired. Upload the file again.",
      410,
    );
  return item;
}
export async function attachmentContent(item: Attachment) {
  if (storageProvider() === "blob") {
    const result = await get(item.storagePath, { access: "private" });
    if (!result?.stream) throw new AppError("File tidak tersedia.", 404);
    return result.stream;
  }
  if (storageProvider() !== "local")
    throw new AppError("Penyimpanan belum tersedia.", 503);
  return new Uint8Array(
    await readFile(/* turbopackIgnore: true */ localPath(item.storagePath)),
  );
}
// Keep a deletion tombstone until every previously issued upload capability
// must have expired (reservation <= 1 hour, client token <= 10 minutes).
// A late in-flight transfer can otherwise recreate an untracked Blob after delete.
const DELETION_HOLD = 70 * 60 * 1000;
export async function purgeEntityAttachments(
  type: "task" | "project",
  id: string,
) {
  const { db } = await database();
  const files = await db
    .select()
    .from(s.attachment)
    .where(
      and(
        eq(s.attachment.entityType, type),
        eq(s.attachment.entityId, id),
        eq(s.attachment.state, "deleting"),
      ),
    )
    .limit(100);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, files.length) }, async () => {
      while (next < files.length) await purgeDeletedAttachment(files[next++]);
    }),
  );
}
export async function purgeDeletedAttachment(
  item: Pick<Attachment, "id" | "storagePath" | "createdAt">,
) {
  try {
    const provider = storageProvider();
    if (provider === "blob") await del(item.storagePath);
    else if (provider === "local")
      await rm(localPath(item.storagePath), { force: true });
    else return false;
    if (Date.now() - +item.createdAt < DELETION_HOLD) return false;
    const { db } = await database();
    await db
      .delete(s.attachment)
      .where(
        and(eq(s.attachment.id, item.id), eq(s.attachment.state, "deleting")),
      );
    return true;
  } catch {
    return false;
  }
}
export async function removeAttachment(
  actor: Actor,
  id: string,
  draftId?: string,
  pendingOnly = false,
) {
  z.uuid().parse(id);
  const { db } = await database();
  const [item] = await db
    .select()
    .from(s.attachment)
    .where(eq(s.attachment.id, id));
  if (!item) throw new AppError("Dokumen tidak ditemukan.", 404);
  if (
    item.entityType === "boardRoomProject" ||
    (!item.isCurrent && item.state === "ready")
  )
    requireAdmin(actor);
  if (
    (
      await db.execute(
        sql`SELECT 1 FROM legacy_record WHERE kind='attachment' AND id=${id}`,
      )
    ).rows.length
  )
    throw new AppError("Archived documents are read-only.", 409);
  if (draftId) {
    z.uuid().parse(draftId);
    if (item.entityType !== "taskDraft" || item.entityId !== draftId)
      throw new AppError(
        "This attachment is already linked to a task. Retry creating the task to recover its saved result.",
        409,
      );
  }
  if (
    item.ownerEmail !== actor.email &&
    (item.entityType === "taskDraft" || !actor.isAdmin)
  )
    throw new AppError(
      "Hanya pengunggah atau admin yang dapat menghapus dokumen.",
      403,
    );
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    const [locked] = await tx
      .select()
      .from(s.attachment)
      .where(eq(s.attachment.id, id))
      .for("update");
    if (!locked) throw new AppError("Document not found.", 404);
    if (pendingOnly && locked.state !== "pending")
      throw new AppError(
        "Upload has already completed or changed. Refresh documents.",
        409,
      );
    if (
      locked.entityType === "boardRoomProject" ||
      (!locked.isCurrent && locked.state === "ready")
    )
      requireAdmin(actor);
    if (
      locked.ownerEmail !== actor.email &&
      (locked.entityType === "taskDraft" || !actor.isAdmin)
    )
      throw new AppError(
        "Only the uploader or an administrator can delete this document.",
        403,
      );
    if (draftId) {
      const [current] = await tx
        .select({
          entityType: s.attachment.entityType,
          entityId: s.attachment.entityId,
        })
        .from(s.attachment)
        .where(eq(s.attachment.id, id));
      if (
        !current ||
        current.entityType !== "taskDraft" ||
        current.entityId !== draftId
      )
        throw new AppError(
          "This attachment is already linked to a task. Retry creating the task to recover its saved result.",
          409,
        );
    }
    await tx
      .update(s.workspaceSetting)
      .set({ revision: sql`${s.workspaceSetting.revision}+1` })
      .where(eq(s.workspaceSetting.id, "primary"));
    await tx.execute(sql`SELECT pg_notify('evolve_changed','refresh')`);
    await tx
      .update(s.attachment)
      .set({ state: "deleting" })
      .where(eq(s.attachment.id, id));
    await tx
      .update(s.member)
      .set({ avatarId: null, version: sql`${s.member.version}+1` })
      .where(eq(s.member.avatarId, id));
    await tx
      .update(s.workspaceSetting)
      .set({ logoId: null, version: sql`${s.workspaceSetting.version}+1` })
      .where(eq(s.workspaceSetting.logoId, id));
  });
  return { ok: true, pendingCleanup: !(await purgeDeletedAttachment(item)) };
}

// Recover abandoned uploads and failed deletions before accepting more files.
// Blob upload tokens expire after 10 minutes, before pending reservations expire.
export async function cleanupAttachments() {
  const provider = storageProvider();
  if (!provider) return;
  const { db } = await database();
  const expired = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    return tx.execute(
      sql`UPDATE attachment SET state='deleting' WHERE id IN (SELECT id FROM attachment WHERE NOT EXISTS(SELECT 1 FROM legacy_record l WHERE l.kind='attachment' AND l.id=attachment.id) AND ((state='deleting' AND created_at<now()-interval '70 minutes') OR (state='pending' AND created_at<now()-interval '1 hour') OR (state='ready' AND created_at<now()-interval '1 day' AND (entity_type='taskDraft' OR (entity_type='avatar' AND NOT EXISTS(SELECT 1 FROM member WHERE avatar_id=attachment.id)) OR (entity_type='workspace' AND NOT EXISTS(SELECT 1 FROM workspace_setting WHERE logo_id=attachment.id)))) ) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING id,storage_path,created_at`,
    );
  });
  for (const row of expired.rows) {
    await purgeDeletedAttachment({
      id: String(row.id),
      storagePath: String(row.storage_path),
      createdAt: new Date(row.created_at as string),
    });
  }
}
