import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { assertActorActive } from "./membership";
import { AppError, requireAdmin } from "./permissions";
import type { Actor } from "./types";
import * as s from "./db/schema";
import {
  attachmentDto,
  readAttachment,
  withDocumentMetadata,
} from "./attachments";
export async function documentHistory(actor: Actor, id: string) {
  const { db } = await database();
  await assertActorActive(db, actor);
  const file = await readAttachment(id, actor);
  if (!file.documentId)
    return { documentId: null, currentId: file.id, versions: [file] };
  const doc = (
    await db.execute(
      sql`SELECT current_attachment_id,version FROM logical_document WHERE id=${file.documentId}`,
    )
  ).rows[0];
  const rows = await db.execute(
    sql`SELECT id,filename,size,purpose,owner_email AS "ownerEmail",created_at AS "createdAt",version_number AS "versionNumber",is_current AS "isCurrent" FROM attachment WHERE document_id=${file.documentId} AND state='ready' ORDER BY version_number DESC`,
  );
  return {
    documentId: file.documentId,
    currentId: doc?.current_attachment_id as string | null,
    version: Number(doc?.version ?? 1),
    versions: rows.rows,
  };
}
export async function restoreDocumentVersion(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const cmd = z
      .object({ id: z.uuid(), expectedCurrentId: z.uuid().nullable() })
      .strict()
      .parse(input),
    { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    const file = (
      await tx.execute(
        sql`SELECT * FROM attachment WHERE id=${cmd.id} AND state='ready' FOR UPDATE`,
      )
    ).rows[0];
    if (!file?.document_id)
      throw new AppError("Document version not found.", 404);
    if (
      (
        await tx.execute(
          sql`SELECT 1 FROM legacy_record WHERE kind='attachment' AND id=${cmd.id}`,
        )
      ).rows.length
    )
      throw new AppError("Archived documents are read-only.", 409);
    const doc = (
      await tx.execute(
        sql`SELECT * FROM logical_document WHERE id=${file.document_id} FOR UPDATE`,
      )
    ).rows[0];
    if (doc.current_attachment_id !== cmd.expectedCurrentId)
      throw new AppError("Document changed. Refresh version history.", 409);
    await tx.execute(
      sql`UPDATE attachment SET is_current=false WHERE document_id=${file.document_id} AND is_current`,
    );
    await tx.execute(
      sql`UPDATE attachment SET is_current=true WHERE id=${cmd.id}`,
    );
    await tx.execute(
      sql`UPDATE logical_document SET current_attachment_id=${cmd.id},version=version+1 WHERE id=${file.document_id}`,
    );
    await tx.execute(
      sql`UPDATE workspace_setting SET revision=revision+1 WHERE id='primary'`,
    );
    await tx.execute(sql`SELECT pg_notify('evolve_changed','documents')`);
    const [current] = await tx
      .select()
      .from(s.attachment)
      .where(eq(s.attachment.id, cmd.id));
    return {
      restored: cmd.id,
      file: (await withDocumentMetadata([attachmentDto(current)], tx))[0],
    };
  });
}
