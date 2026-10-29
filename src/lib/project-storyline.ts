import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { assertActorActive } from "./membership";
import { AppError, requireAdmin } from "./permissions";
import type { Actor } from "./types";
import type { AttachmentInfo } from "./attachment-types";
import { documentMetadataSchema, documentDateSchema } from "./document-model";

export async function updateDocumentMetadata(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<AttachmentInfo> {
  requireAdmin(actor);
  z.uuid().parse(id);
  const command = documentMetadataSchema.parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    const row = (
      await tx.execute(
        sql`SELECT a.*,d.version AS document_version FROM attachment a JOIN logical_document d ON d.id=a.document_id JOIN board_room_project p ON p.id=a.entity_id WHERE a.id=${id} AND a.entity_type='boardRoomProject' AND a.state='ready' AND a.is_current AND d.current_attachment_id=a.id FOR UPDATE OF a,d`,
      )
    ).rows[0];
    if (!row) throw new AppError("Current project document not found.", 404);
    if (
      (
        await tx.execute(
          sql`SELECT 1 FROM legacy_record WHERE (kind='attachment' AND id=${id}) OR (kind='project' AND id=${row.entity_id})`,
        )
      ).rows.length
    )
      throw new AppError("Archived documents are read-only.", 409);
    if (Number(row.document_version) !== command.expectedDocumentVersion)
      throw new AppError(
        "Document changed. Your date has not been saved. Refresh its metadata and review your input.",
        409,
      );
    await tx.execute(
      sql`UPDATE logical_document SET document_date=${command.documentDate}::date,version=version+1 WHERE id=${row.document_id}`,
    );
    await tx.execute(
      sql`UPDATE workspace_setting SET revision=revision+1 WHERE id='primary'`,
    );
    await tx.execute(sql`SELECT pg_notify('evolve_changed','documents')`);
    return {
      id: String(row.id),
      documentId: String(row.document_id),
      documentDate: command.documentDate,
      documentVersion: Number(row.document_version) + 1,
      filename: String(row.filename),
      purpose: row.purpose as AttachmentInfo["purpose"],
      versionNumber: Number(row.version_number),
      isCurrent: true,
      contentType: String(row.content_type),
      size: Number(row.size),
      ownerEmail: String(row.owner_email),
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  });
}
const cursorSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    group: z.enum(["dated", "undated"]),
    order: z.enum(["oldest", "newest"]),
    date: documentDateSchema.nullable(),
    name: z.string().max(180),
    id: z.uuid(),
    project: z.uuid(),
  })
  .strict();
const querySchema = z
  .object({
    order: z.enum(["oldest", "newest"]).default("oldest"),
    group: z.enum(["dated", "undated"]).default("dated"),
    cursor: z.string().max(2000).optional(),
  })
  .strict();
export type StorylinePage = {
  items: AttachmentInfo[];
  datedCount: number;
  undatedCount: number;
  nextCursor: string | null;
  revision: number;
};
export async function projectStoryline(
  actor: Actor,
  projectId: string,
  input: unknown,
): Promise<StorylinePage> {
  z.uuid().parse(projectId);
  const q = querySchema.parse(input);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (q.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(q.cursor, "base64url").toString()),
      );
    } catch {
      throw new AppError("Invalid Storyline page. Refresh the project.");
    }
  }
  const { db } = await database();
  return db.transaction(
    async (tx) => {
      await assertActorActive(tx, actor);
      if (
        !(
          await tx.execute(
            sql`SELECT id FROM board_room_project WHERE id=${projectId}`,
          )
        ).rows.length
      )
        throw new AppError("Project not found.", 404);
      const revision = Number(
        (
          await tx.execute(
            sql`SELECT revision FROM workspace_setting WHERE id='primary'`,
          )
        ).rows[0].revision,
      );
      if (
        cursor &&
        (cursor.revision !== revision ||
          cursor.project !== projectId ||
          cursor.group !== q.group ||
          cursor.order !== q.order)
      )
        throw new AppError(
          "Documents changed. Refresh the Storyline before loading more.",
          409,
        );
      const scope = sql`a.entity_type='boardRoomProject' AND a.entity_id=${projectId} AND a.state='ready' AND a.is_current AND d.current_attachment_id=a.id AND NOT EXISTS(SELECT 1 FROM legacy_record l WHERE (l.kind='attachment' AND l.id=a.id) OR (l.kind='project' AND l.id=a.entity_id))`;
      const counts = (
        await tx.execute(
          sql`SELECT count(*) FILTER(WHERE d.document_date IS NOT NULL)::int AS dated,count(*) FILTER(WHERE d.document_date IS NULL)::int AS undated FROM attachment a JOIN logical_document d ON d.id=a.document_id WHERE ${scope}`,
        )
      ).rows[0];
      const after = cursor
        ? q.group === "undated"
          ? sql`AND (lower(a.filename),d.id)>(${cursor.name},${cursor.id})`
          : sql`AND (d.document_date ${q.order === "oldest" ? sql`>` : sql`<`} ${cursor.date}::date OR (d.document_date=${cursor.date}::date AND (lower(a.filename),d.id)>(${cursor.name},${cursor.id})))`
        : sql``;
      const rows = (
        await tx.execute(
          sql`SELECT a.*,d.document_date::text AS document_date,d.version AS document_version,lower(a.filename) AS sort_name FROM attachment a JOIN logical_document d ON d.id=a.document_id WHERE ${scope} AND d.document_date IS ${q.group === "dated" ? sql`NOT NULL` : sql`NULL`} ${after} ORDER BY d.document_date ${q.order === "oldest" ? sql`ASC` : sql`DESC`},lower(a.filename),d.id LIMIT 51`,
        )
      ).rows;
      const page = rows.slice(0, 50),
        last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: String(row.id),
          documentId: String(row.document_id),
          documentDate: row.document_date as string | null,
          documentVersion: Number(row.document_version),
          filename: String(row.filename),
          purpose: row.purpose as AttachmentInfo["purpose"],
          versionNumber: Number(row.version_number),
          isCurrent: true,
          contentType: String(row.content_type),
          size: Number(row.size),
          ownerEmail: String(row.owner_email),
          createdAt: new Date(row.created_at as string).toISOString(),
        })),
        datedCount: Number(counts.dated),
        undatedCount: Number(counts.undated),
        revision,
        nextCursor:
          rows.length > 50 && last
            ? Buffer.from(
                JSON.stringify({
                  revision,
                  group: q.group,
                  order: q.order,
                  date: last.document_date,
                  name: last.sort_name,
                  id: last.document_id,
                  project: projectId,
                }),
              ).toString("base64url")
            : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
