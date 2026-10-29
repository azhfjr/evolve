import {
  isNull,
  notInArray,
  and,
  asc,
  desc,
  eq,
  ne,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { database } from "./db";
import * as s from "./db/schema";
import { AppError, requireAdmin } from "./permissions";
import { assertActorActive } from "./membership";
import type { Actor } from "./types";
import { purgeDeletedAttachment } from "./attachments";
import {
  fileQuerySchema,
  deleteFilesSchema,
  WORKSPACE_FILE_LIMIT,
  type FileInventory,
} from "./file-management-model";

export async function fileInventory(
  actor: Actor,
  input: unknown,
): Promise<FileInventory> {
  requireAdmin(actor);
  const query = fileQuerySchema.parse(input);
  const { db } = await database();
  await assertActorActive(db, actor);
  const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    query.room === "all"
      ? undefined
      : query.room === "board"
        ? eq(s.attachment.entityType, "boardRoomProject")
        : ne(s.attachment.entityType, "boardRoomProject"),
    query.purpose === "all"
      ? undefined
      : query.purpose === "unlabelled"
        ? and(
            isNull(s.attachment.purpose),
            notInArray(s.attachment.entityType, ["avatar", "workspace"]),
          )
        : eq(s.attachment.purpose, query.purpose),
    query.q
      ? or(
          ilike(s.attachment.filename, pattern),
          ilike(s.attachment.ownerEmail, pattern),
        )
      : undefined,
    query.type === "all" ? undefined : eq(s.attachment.entityType, query.type),
    query.state === "all" ? undefined : eq(s.attachment.state, query.state),
    query.history === "current"
      ? sql`(${s.attachment.isCurrent} OR ${s.attachment.state}<>'ready')`
      : undefined,
  );
  const legacyProjectId = sql`CASE WHEN ${s.attachment.entityType}='project' THEN ${s.attachment.entityId} ELSE (SELECT l.data->>'project_id' FROM legacy_record l WHERE l.kind='task' AND l.id=${s.attachment.entityId}) END`;
  const [usage, total, rows] = await Promise.all([
    db.execute(
      sql`SELECT coalesce(sum(size),0)::bigint AS bytes,count(*)::int AS count,coalesce(sum(size) FILTER(WHERE state='ready'),0)::bigint AS ready,coalesce(sum(size) FILTER(WHERE state='pending'),0)::bigint AS pending,coalesce(sum(size) FILTER(WHERE state='deleting'),0)::bigint AS deleting,
      coalesce(sum(size) FILTER(WHERE entity_type IN ('task','taskDraft','project')),0)::bigint AS locker_bytes,
      count(*) FILTER(WHERE entity_type IN ('task','taskDraft','project'))::int AS locker_count,
      coalesce(sum(size) FILTER(WHERE entity_type='boardRoomProject'),0)::bigint AS board_bytes,
      count(*) FILTER(WHERE entity_type='boardRoomProject')::int AS board_count,
      coalesce(sum(size) FILTER(WHERE entity_type IN ('avatar','workspace')),0)::bigint AS shared_bytes,
      count(*) FILTER(WHERE entity_type IN ('avatar','workspace'))::int AS shared_count FROM attachment`,
    ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(s.attachment)
      .where(filter),
    db
      .select({
        file: s.attachment,
        archived: sql<boolean>`EXISTS(SELECT 1 FROM legacy_record l WHERE l.kind='attachment' AND l.id=${s.attachment.id})`,
        taskTitle: sql<string>`coalesce(${s.task.title},(SELECT l.data->>'title' FROM legacy_record l WHERE l.kind='task' AND l.id=${s.attachment.entityId}))`,
        projectName: sql<string>`coalesce(${s.project.name},(SELECT l.data->>'name' FROM legacy_record l WHERE l.kind='project' AND l.id=${legacyProjectId}))`,
        projectId: sql<string>`coalesce(${s.project.id},${legacyProjectId})`,
        taskName: s.task.title,
        boardProjectName: sql<
          string | null
        >`${s.boardRoomProject.data}->>'name'`,
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
      .where(filter)
      .orderBy(
        query.sort === "largest"
          ? desc(s.attachment.size)
          : query.sort === "oldest"
            ? asc(s.attachment.createdAt)
            : desc(s.attachment.createdAt),
        asc(s.attachment.id),
      )
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
  ]);
  const u = usage.rows[0];
  return {
    items: rows.map(
      ({
        file,
        archived,
        taskTitle,
        projectName,
        projectId,
        taskName,
        boardProjectName,
      }) => ({
        archived,
        id: file.id,
        filename: file.filename,
        purpose: file.purpose as
          import("./document-model").DocumentPurpose | null,
        room:
          file.entityType === "boardRoomProject"
            ? ("board" as const)
            : ("locker" as const),
        projectId:
          file.entityType === "boardRoomProject" ? file.entityId : projectId,
        projectName: boardProjectName || projectName,
        taskName,
        contentType: file.contentType,
        size: file.size,
        ownerEmail: file.ownerEmail,
        createdAt: file.createdAt.toISOString(),
        documentId: file.documentId,
        versionNumber: file.versionNumber,
        isCurrent: file.isCurrent,
        entityType: file.entityType,
        entityId: file.entityId,
        state: file.state,
        context:
          file.entityType === "task"
            ? taskTitle || "Task"
            : file.entityType === "project"
              ? projectName || "Project"
              : file.entityType === "boardRoomProject"
                ? `Board Room · ${boardProjectName || "Project"}`
                : file.entityType === "taskDraft"
                  ? "Private task draft"
                  : file.entityType === "avatar"
                    ? "Profile photo"
                    : "Workspace logo",
        canRetryCleanup:
          file.state === "deleting" &&
          Date.now() - +file.createdAt >= 70 * 60000,
        readable:
          file.state === "ready" &&
          (file.entityType !== "taskDraft" ||
            (file.ownerEmail === actor.email &&
              Date.now() - +file.createdAt < 86400000)),
      }),
    ),
    total: total[0].count,
    page: query.page,
    limit: query.limit,
    usage: {
      breakdown: {
        locker: {
          bytes: Number(u.locker_bytes),
          count: Number(u.locker_count),
        },
        board: { bytes: Number(u.board_bytes), count: Number(u.board_count) },
        sharedAssets: {
          bytes: Number(u.shared_bytes),
          count: Number(u.shared_count),
        },
      },
      roomBytes:
        query.room === "all"
          ? Number(u.bytes)
          : query.room === "board"
            ? Number(u.board_bytes)
            : Number(u.bytes) - Number(u.board_bytes),
      roomCount:
        query.room === "all"
          ? Number(u.count)
          : query.room === "board"
            ? Number(u.board_count)
            : Number(u.count) - Number(u.board_count),
      bytes: Number(u.bytes),
      limit: WORKSPACE_FILE_LIMIT,
      count: Number(u.count),
      ready: Number(u.ready),
      pending: Number(u.pending),
      deleting: Number(u.deleting),
    },
  };
}

export async function deleteManagedFiles(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const { ids, room } = deleteFilesSchema.parse(input);
  const { db } = await database();
  const marked = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    // Match workspace command/finalization lock order before locking file rows.
    await tx
      .update(s.workspaceSetting)
      .set({ revision: sql`${s.workspaceSetting.revision}+1` })
      .where(eq(s.workspaceSetting.id, "primary"));
    const rows = await tx
      .select()
      .from(s.attachment)
      .where(inArray(s.attachment.id, ids))
      .for("update");
    if (
      rows.some(
        (row) => (row.entityType === "boardRoomProject") !== (room === "board"),
      )
    )
      throw new AppError("Choose files belonging to this room only.", 403);
    const archived = await tx.execute(
      sql`SELECT 1 FROM legacy_record WHERE kind='attachment' AND id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}) LIMIT 1`,
    );
    if (archived.rows.length)
      throw new AppError("Archived documents are read-only.", 409);
    if (!rows.length)
      return {
        files: rows,
        references: { profiles: [], workspaceVersion: null },
      };
    await tx
      .update(s.attachment)
      .set({ state: "deleting" })
      .where(inArray(s.attachment.id, ids));
    const profiles = await tx
      .update(s.member)
      .set({ avatarId: null, version: sql`${s.member.version}+1` })
      .where(inArray(s.member.avatarId, ids))
      .returning({ email: s.member.email, version: s.member.version });
    const logos = await tx
      .update(s.workspaceSetting)
      .set({ logoId: null, version: sql`${s.workspaceSetting.version}+1` })
      .where(inArray(s.workspaceSetting.logoId, ids))
      .returning({ version: s.workspaceSetting.version });
    const fresh = rows.filter((row) => row.state !== "deleting").length;
    if (fresh)
      await tx.insert(s.activity).values({
        id: crypto.randomUUID(),
        actor: actor.email,
        kind: "general",
        message: `Removed ${fresh} workspace ${fresh === 1 ? "file" : "files"}.`,
      });
    await tx.execute(sql`SELECT pg_notify('evolve_changed','refresh')`);
    return {
      files: rows,
      references: { profiles, workspaceVersion: logos[0]?.version ?? null },
    };
  });
  const files = marked.files;
  let purged = 0,
    next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, files.length) }, async () => {
      while (next < files.length) {
        const item = files[next++];
        if (await purgeDeletedAttachment(item)) purged++;
      }
    }),
  );
  return {
    references: marked.references,
    removed: files.length,
    alreadyRemoved: ids.length - files.length,
    pendingCleanup: files.length - purged,
  };
}
