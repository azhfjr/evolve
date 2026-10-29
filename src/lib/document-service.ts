import { and, eq, inArray, sql } from "drizzle-orm";
import { database } from "./db";
import * as s from "./db/schema";
import { assertActorActive } from "./membership";
import { AppError, requireAdmin } from "./permissions";
import type { Actor } from "./types";
import { attachmentDto, withDocumentMetadata } from "./attachments";
import {
  archiveRequestSchema,
  documentLabelSchema,
  archiveFilePath,
  type ArchiveFile,
  type ArchiveManifest,
  type DocumentPurpose,
} from "./document-model";
export async function labelDocument(actor: Actor, id: string, input: unknown) {
  const command = documentLabelSchema.parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    // Same lock order as attachment finalization and managed deletion.
    await tx
      .update(s.workspaceSetting)
      .set({ revision: sql`${s.workspaceSetting.revision}+1` })
      .where(eq(s.workspaceSetting.id, "primary"));
    const [file] = await tx
      .select()
      .from(s.attachment)
      .where(eq(s.attachment.id, id))
      .for("update");
    if (!file || file.state !== "ready")
      throw new AppError("Document not found or no longer available.", 404);
    if (file.entityType === "avatar" || file.entityType === "workspace")
      throw new AppError("Purpose labels apply to documents only.", 400);
    if (file.entityType === "boardRoomProject") requireAdmin(actor);
    else if (
      file.entityType === "taskDraft"
        ? file.ownerEmail !== actor.email
        : !actor.isAdmin && file.ownerEmail !== actor.email
    )
      throw new AppError("You cannot change this document label.", 403);
    if (!file.isCurrent)
      throw new AppError(
        "Edit the current document label instead of a historical version.",
        409,
      );
    if (
      (
        await tx.execute(
          sql`SELECT 1 FROM legacy_record WHERE kind='attachment' AND id=${id}`,
        )
      ).rows.length
    )
      throw new AppError("Archived documents are read-only.", 409);
    if (file.purpose !== command.expectedPurpose)
      throw new AppError(
        "This label changed. Refresh the document before trying again.",
        409,
      );
    const [updated] = await tx
      .update(s.attachment)
      .set({ purpose: command.purpose })
      .where(eq(s.attachment.id, id))
      .returning();
    await tx.execute(sql`SELECT pg_notify('evolve_changed','documents')`);
    return (await withDocumentMetadata([attachmentDto(updated)], tx))[0];
  });
}
export async function documentManifest(
  actor: Actor,
  input: unknown,
): Promise<ArchiveManifest> {
  const query = archiveRequestSchema.parse(input);
  const { db } = await database();
  await assertActorActive(db, actor);
  if (query.kind !== "project" || query.includeHistory) requireAdmin(actor);
  let canonicalProjectId: string | null = null;
  if (query.kind === "project" && query.room === "locker") {
    const row = (
      await db.execute(
        sql`SELECT board_project_id FROM project WHERE id=${query.id}`,
      )
    ).rows[0];
    canonicalProjectId = (row?.board_project_id as string | null) ?? null;
  }
  if (query.kind === "project") {
    const table = query.room === "board" ? s.boardRoomProject : s.project;
    if (
      !(
        await db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.id, query.id))
      ).length
    )
      throw new AppError("Project not found.", 404);
  }
  const legacyProjectId = sql`CASE WHEN ${s.attachment.entityType}='project' THEN ${s.attachment.entityId} ELSE (SELECT l.data->>'project_id' FROM legacy_record l WHERE l.kind='task' AND l.id=${s.attachment.entityId}) END`;
  const rows = await db
    .select({
      file: s.attachment,
      projectName: sql<string>`coalesce(${s.project.name},(SELECT l.data->>'name' FROM legacy_record l WHERE l.kind='project' AND l.id=${legacyProjectId}))`,
      projectId: sql<string>`coalesce(${s.project.id},${legacyProjectId})`,
      taskName: sql<string>`coalesce(${s.task.title},(SELECT l.data->>'title' FROM legacy_record l WHERE l.kind='task' AND l.id=${s.attachment.entityId}))`,
      taskProjectId: s.task.projectId,
      boardName: sql<string | null>`${s.boardRoomProject.data}->>'name'`,
      boardId: s.boardRoomProject.id,
    })
    .from(s.attachment)
    .leftJoin(
      s.task,
      and(
        eq(s.attachment.entityType, "task"),
        eq(s.attachment.entityId, s.task.id),
      ),
    )
    .leftJoin(
      s.project,
      sql`(${s.attachment.entityType}='project' AND ${s.attachment.entityId}=${s.project.id}) OR (${s.attachment.entityType}='task' AND ${s.task.projectId}=${s.project.id})`,
    )
    .leftJoin(
      s.boardRoomProject,
      and(
        eq(s.attachment.entityType, "boardRoomProject"),
        eq(s.attachment.entityId, s.boardRoomProject.id),
      ),
    )
    .where(
      query.kind === "selection"
        ? inArray(s.attachment.id, query.ids)
        : inArray(s.attachment.entityType, [
            "task",
            "project",
            "boardRoomProject",
          ]),
    );
  const relevant = rows.filter(({ file, projectId, boardId }) => {
    if (!["task", "project", "boardRoomProject"].includes(file.entityType))
      return false;
    const room = file.entityType === "boardRoomProject" ? "board" : "locker";
    const sharedProjectDocument =
      query.kind === "project" &&
      query.room === "locker" &&
      room === "board" &&
      canonicalProjectId !== null &&
      boardId === canonicalProjectId;
    if (query.room && query.room !== room && !sharedProjectDocument)
      return false;
    if (!query.includeHistory && file.state === "ready" && !file.isCurrent)
      return false;
    return (
      query.kind !== "project" ||
      (room === "board"
        ? boardId === (canonicalProjectId ?? query.id)
        : projectId === query.id)
    );
  });
  if (query.kind === "selection" && relevant.length !== query.ids.length)
    throw new AppError(
      "Select only project or task documents belonging to this scope. Private drafts and shared images cannot be exported.",
      403,
    );
  const files: ArchiveFile[] = relevant
    .filter(({ file }) => file.state === "ready")
    .map((row) => {
      const file: Omit<ArchiveFile, "path"> = {
        id: row.file.id,
        filename: row.file.filename,
        size: row.file.size,
        purpose: row.file.purpose as DocumentPurpose | null,
        ownerEmail: row.file.ownerEmail,
        createdAt: row.file.createdAt.toISOString(),
        room: row.file.entityType === "boardRoomProject" ? "board" : "locker",
        projectId: row.boardId || row.projectId,
        projectName: row.boardName || row.projectName || "Unassigned",
        taskName: row.taskName,
      };
      return { ...file, path: archiveFilePath(file) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    excluded: relevant.length - files.length,
    bytes: files.reduce((n, f) => n + f.size, 0),
  };
}
