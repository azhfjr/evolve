import {
  applyProjectTemplate,
  makeTemplateContext,
} from "../project-template/service";
import { assertPlannedCodAssignment } from "./cod-policy";
import { categoryExpression } from "./category-query";
import { dashboardAnalytics } from "./dashboard";
import { boardProjectWhere, fileCount, valid } from "./project-query";
export { boardProjectWhere } from "./project-query";
import { replaceProjectAssets } from "../assets/service";
import { stageNeedsReason } from "./health";
import { createHash } from "node:crypto";
import {
  ensureWorkspaceProfile,
  readWorkspaceExperience,
} from "../workspace-experience";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import * as s from "../db/schema";
import { AppError, requireAdmin } from "../permissions";
import { assertActorActive } from "../membership";
import { listAttachments } from "../attachments";
import type { Actor } from "../types";
import {
  projectSchema,
  normalizeProjectPayload,
  querySchema,
  PRIMARY_CATEGORIES,
  type BoardProject,
  type BoardSnapshot,
  type BoardConfig,
  type ProjectPayload,
} from "./model";
import {
  parseProjectCSV,
  mergeImportedProject,
  CSV_COLUMNS,
  exportProjectCSV,
  projectCSVStream,
  type ColumnMapping,
} from "./csv";
type DB = Awaited<ReturnType<typeof database>>["db"];
type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
type RawProject = {
  id: string;
  external_id: string;
  data: ProjectPayload;
  version: number;
  document_revision: number;
  reviewed_revision: number | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  updated_at: Date;
  file_count?: number;
};
function dto(row: RawProject): BoardProject {
  return {
    ...normalizeProjectPayload(row.data),
    id: row.id,
    version: row.version,
    documentRevision: row.document_revision,
    reviewedRevision: row.reviewed_revision,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at
      ? new Date(row.reviewed_at).toISOString()
      : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    fileCount: Number(row.file_count ?? 0),
    valid:
      row.reviewed_revision !== null &&
      row.reviewed_revision === row.document_revision,
  };
}
async function config(tx: TX): Promise<BoardConfig> {
  const [c] = await tx
    .select()
    .from(s.boardRoomConfig)
    .where(eq(s.boardRoomConfig.id, "primary"));
  if (!c) throw new AppError("Board Room migration has not been applied.", 503);
  return { stages: c.stages, version: c.version, revision: c.revision };
}
export async function queryBoardRoom(
  actor: Actor,
  input: unknown,
): Promise<BoardSnapshot> {
  const q = querySchema.parse(input);
  const { db } = await database();
  await ensureWorkspaceProfile(actor);
  return db.transaction(
    async (tx) => {
      await assertActorActive(tx, actor);
      const c = await config(tx),
        w = boardProjectWhere(q);
      const experience = await readWorkspaceExperience(tx, actor);
      const [groups, years, total, rows] = await (async () => {
        const results = [];
        for (const run of [
          () =>
            tx.execute(
              sql`SELECT nullif(${categoryExpression()},'uncategorized') AS category,(p.data->>'stage')::int AS stage,${valid} AS valid,count(*)::int AS count,count(*) FILTER(WHERE ${fileCount}=0)::int AS no_files FROM board_room_project p WHERE ${w} GROUP BY 1,2,3`,
            ),
          () =>
            tx.execute(
              sql`SELECT (p.data->>'codYear')::int AS year,nullif(${categoryExpression()},'uncategorized') AS category,count(*)::int AS count,min((p.data->>'startYear')::int) AS start_year,max((p.data->>'startYear')::int) AS end_year FROM board_room_project p WHERE ${boardProjectWhere(q, true)} GROUP BY 1,2 ORDER BY 1 NULLS LAST`,
            ),
          () =>
            tx.execute(
              sql`SELECT count(*)::int AS count FROM board_room_project`,
            ),
          () =>
            tx.execute(
              sql`SELECT p.*,${fileCount} AS file_count FROM board_room_project p WHERE ${w} ORDER BY ${q.sort === "name" ? sql`lower(p.data->>'name')` : q.sort === "capacity" ? sql`(p.data->>'capacity')::numeric` : sql`(p.data->>'codYear')::int`} ${q.direction === "desc" ? sql`DESC` : sql`ASC`} NULLS LAST,p.external_id LIMIT 50 OFFSET ${(q.page - 1) * 50}`,
            ),
        ])
          results.push(await run());
        return results;
      })();
      const stages = Array(11).fill(0) as number[];
      let count = 0,
        validCount = 0,
        noFiles = 0;
      const categoryCounts = [...PRIMARY_CATEGORIES, "Uncategorized"].map(
        (name) => ({
          name,
          total: 0,
          valid: 0,
        }),
      );
      for (const g of groups.rows) {
        const n = Number(g.count),
          stage = Number(g.stage);
        count += n;
        stages[stage] += n;
        noFiles += Number(g.no_files);
        if (g.valid) validCount += n;
        const cat = categoryCounts.find(
          (c) => c.name === (g.category || "Uncategorized"),
        )!;
        cat.total += n;
        if (g.valid) cat.valid += n;
      }
      const yearCounts: BoardSnapshot["summary"]["years"] = [];
      for (const g of years.rows) {
        const year = g.year === null ? null : Number(g.year);
        let entry = yearCounts.find((y) => y.year === year);
        if (!entry) {
          entry = {
            year,
            total: 0,
            categories: Object.fromEntries(
              PRIMARY_CATEGORIES.map((c) => [c, 0]),
            ),
          };
          yearCounts.push(entry);
        }
        entry.total += Number(g.count);
        entry.categories[String(g.category || "Uncategorized")] = Number(
          g.count,
        );
      }
      return {
        ...experience,
        analytics: await dashboardAnalytics(tx, q),
        theme: experience.profile.preferences.theme,
        config: c,
        projects: (rows.rows as unknown as RawProject[]).map(dto),
        summary: {
          total: count,
          allTotal: Number(total.rows[0].count),
          valid: validCount,
          noFiles,
          needsReview: count - validCount - noFiles,
          stages,
          categories: categoryCounts.filter(
            (c) => c.name !== "Uncategorized" || c.total > 0,
          ),
          rangeStart: years.rows
            .flatMap((g) => [g.year, g.start_year])
            .filter((v) => v !== null).length
            ? Math.min(
                ...years.rows
                  .flatMap((g) => [g.year, g.start_year])
                  .filter((v) => v !== null)
                  .map(Number),
              )
            : null,
          rangeEnd: years.rows
            .flatMap((g) => [g.year, g.end_year])
            .filter((v) => v !== null).length
            ? Math.max(
                ...years.rows
                  .flatMap((g) => [g.year, g.end_year])
                  .filter((v) => v !== null)
                  .map(Number),
              )
            : null,
          years: yearCounts,
        },
        page: q.page,
        pageSize: 50,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
async function getProject(tx: TX, id: string, lock = false) {
  const r = await tx.execute(
    sql`SELECT p.*,${fileCount} AS file_count FROM board_room_project p WHERE p.id=${id} ${lock ? sql`FOR UPDATE OF p` : sql``}`,
  );
  if (!r.rows[0]) throw new AppError("Project not found.", 404);
  return r.rows[0] as unknown as RawProject;
}
export async function boardRoomDetail(actor: Actor, id: string) {
  z.uuid().parse(id);
  const { db } = await database();
  await assertActorActive(db, actor);
  const project = await db.transaction(async (tx) =>
    dto(await getProject(tx, id)),
  );
  const attachments = await listAttachments(actor, "boardRoomProject", id);
  const history = await db
    .select()
    .from(s.boardRoomHistory)
    .where(eq(s.boardRoomHistory.projectId, id))
    .orderBy(sql`${s.boardRoomHistory.createdAt} DESC`)
    .limit(30);
  return {
    project,
    attachments,
    history: history.map((h) => ({
      ...h,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}
const version = z.number().int().positive();
const mapping = z.record(z.string(), z.string().max(180)).optional();
export const boardCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("saveProject"),
      id: z.uuid().optional(),
      version: version.optional(),
      values: projectSchema,
      assetIds: z.array(z.uuid()).max(5000).optional(),
      requestId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("progress"),
      id: z.uuid(),
      version,
      stage: z.number().int().min(0).max(10),
      completed: z.boolean().default(false),
      reason: z.string().trim().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id: z.uuid(),
      version,
      documentRevision: z.number().int().nonnegative(),
      valid: z.boolean(),
      note: z.string().trim().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reviewProgress"),
      id: z.uuid(),
      version,
      note: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("checkDocument"),
      id: z.uuid(),
      version,
      index: z.number().int().min(0).max(19),
      checked: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("stages"),
      version,
      stages: z.array(z.string().trim().min(1).max(45)).length(10),
    })
    .strict(),
  z
    .object({
      action: z.enum(["importPreview", "importCommit"]),
      source: z.string().max(5 * 1024 * 1024),
      mapping,
      previewPage: z.number().int().min(1).max(50).default(1),
      updateStages: z.boolean().default(false),
      reason: z.string().trim().max(1000).optional(),
      token: z.string().max(100).optional(),
    })
    .strict(),
]);
async function history(
  tx: TX,
  actor: Actor,
  id: string,
  kind: string,
  detail: unknown,
) {
  await tx.insert(s.boardRoomHistory).values({
    id: crypto.randomUUID(),
    projectId: id,
    actor: actor.email,
    kind,
    detail,
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function fresh(current: number, expected: number | undefined) {
  if (current !== expected)
    throw new AppError(
      "This record changed. Refresh and review the latest values before saving.",
      409,
    );
}
export async function boardRoomCommand(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const cmd = boardCommandSchema.parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201622)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201615)`);
    const c = await config(tx);
    if (cmd.action === "importPreview" || cmd.action === "importCommit") {
      let imported: ReturnType<typeof parseProjectCSV>;
      try {
        for (const key of Object.keys(cmd.mapping || {}))
          if (!Object.hasOwn(CSV_COLUMNS, key))
            throw Error("Unknown mapped field.");
        imported = parseProjectCSV(cmd.source, cmd.mapping as ColumnMapping);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      const ids = imported.map((r) => r.patch.externalId!);
      const existing = await tx
        .select()
        .from(s.boardRoomProject)
        .where(inArray(s.boardRoomProject.externalId, ids))
        .for("update");
      const templateContext = await makeTemplateContext(tx);
      const changes = await Promise.all(
        imported.map(async (row) => {
          const old = existing.find(
            (p) => p.externalId === row.patch.externalId,
          );
          if (old)
            old.data = normalizeProjectPayload({
              ...old.data,
              templateRevision: old.data.templateRevision ?? 0,
              customValues: old.data.customValues ?? {},
            });
          let data: ProjectPayload;
          try {
            data = mergeImportedProject(old?.data, row.patch, cmd.updateStages);
            data = {
              ...data,
              ...(await applyProjectTemplate(
                tx,
                data,
                old?.data,
                templateContext,
              )),
            };
            assertPlannedCodAssignment(data.codYear, old?.data.codYear);
          } catch (e) {
            throw new AppError(
              `Row ${row.row}: ${e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message}`,
            );
          }
          return {
            row: row.row,
            id: old?.id ?? null,
            externalId: data.externalId,
            name: data.name,
            kind: !old
              ? "New"
              : canonical(data) === canonical(old.data)
                ? "Unchanged"
                : "Updated",
            version: old?.version ?? 0,
            requiresReason:
              !!old &&
              stageNeedsReason(
                old.data.stage,
                data.stage,
                old.data.completed,
                data.completed,
              ),
            data,
            fields: Object.entries(data).flatMap(([field, after]) => {
              const key = field as keyof ProjectPayload;
              const before = old?.data[key] ?? null;
              const display = (v: unknown) =>
                field === "stage"
                  ? v === 0
                    ? "Not started"
                    : v === null
                      ? "—"
                      : `Stage ${v}`
                  : Array.isArray(v)
                    ? JSON.stringify(v)
                    : String(v ?? "—");
              return JSON.stringify(before) === JSON.stringify(after)
                ? []
                : [
                    {
                      field:
                        CSV_COLUMNS[field as keyof typeof CSV_COLUMNS] ?? field,
                      before: display(before),
                      after: display(after),
                    },
                  ];
            }),
          };
        }),
      );
      const token = createHash("sha256")
        .update(
          JSON.stringify({
            revision: c.revision,
            changes,
            reason: cmd.reason ?? "",
          }),
        )
        .digest("hex");
      const preview = {
        token,
        counts: {
          new: changes.filter((c) => c.kind === "New").length,
          updated: changes.filter((c) => c.kind === "Updated").length,
          unchanged: changes.filter((c) => c.kind === "Unchanged").length,
        },
        rows: changes
          .slice((cmd.previewPage - 1) * 100, cmd.previewPage * 100)
          .map(({ row, externalId, name, kind, fields }) => ({
            row,
            externalId,
            name,
            kind,
            fields,
          })),
        total: changes.length,
        requiresReason: changes.some((change) => change.requiresReason),
        page: cmd.previewPage,
        pageSize: 100,
      };
      if (cmd.action === "importPreview") return preview;
      if (cmd.token !== token)
        throw new AppError(
          "Projects, settings or the stage-change reason changed since preview. Preview this CSV again.",
          409,
        );
      if (changes.some((change) => change.requiresReason) && !cmd.reason)
        throw new AppError(
          "Provide a reason for CSV stage jumps or reversals.",
        );
      const batchId = crypto.randomUUID();
      let journaled = false;
      for (const change of changes) {
        if (change.kind === "Unchanged") continue;
        const id = change.id ?? crypto.randomUUID();
        if (change.id)
          await tx
            .update(s.boardRoomProject)
            .set({
              data: change.data,
              version: change.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(s.boardRoomProject.id, id));
        else
          await tx
            .insert(s.boardRoomProject)
            .values({ id, externalId: change.externalId, data: change.data });
        await history(tx, actor, id, "csv_import", {
          externalId: change.externalId,
          batchId,
          counts: preview.counts,
          totalRows: changes.length,
          updateStages: cmd.updateStages,
          reason: cmd.reason ?? "",
        });
        journaled = true;
      }
      if (!journaled && changes[0]?.id)
        await history(tx, actor, changes[0].id, "csv_import", {
          batchId,
          counts: preview.counts,
          totalRows: changes.length,
          updateStages: cmd.updateStages,
          changed: false,
        });
      await tx
        .update(s.boardRoomConfig)
        .set({ revision: c.revision + 1 })
        .where(eq(s.boardRoomConfig.id, "primary"));
      return { ok: true, ...preview };
    }
    if (cmd.action === "stages") {
      fresh(c.version, cmd.version);
      await tx
        .update(s.boardRoomConfig)
        .set({
          stages: cmd.stages,
          version: c.version + 1,
          revision: c.revision + 1,
        })
        .where(eq(s.boardRoomConfig.id, "primary"));
      return { ok: true };
    }
    if (cmd.action === "saveProject") {
      const payloadHash = createHash("sha256")
        .update(canonical([cmd.values, [...(cmd.assetIds ?? [])].sort()]))
        .digest("hex");
      if (!cmd.id && cmd.requestId) {
        const receipt = (
          await tx.execute(
            sql`SELECT * FROM board_creation_receipt WHERE request_id=${cmd.requestId}`,
          )
        ).rows[0];
        if (receipt) {
          if (
            receipt.actor !== actor.email ||
            receipt.payload_hash !== payloadHash
          )
            throw new AppError(
              "This creation request changed. Open the already-created project before editing.",
              409,
            );
          return {
            project: dto(await getProject(tx, String(receipt.project_id))),
          };
        }
      }
      const [duplicate] = await tx
        .select()
        .from(s.boardRoomProject)
        .where(eq(s.boardRoomProject.externalId, cmd.values.externalId));
      if (duplicate && duplicate.id !== cmd.id)
        throw new AppError("RUPTL Code already exists.", 409);
      const old = cmd.id ? await getProject(tx, cmd.id, true) : null;
      if (old) {
        fresh(old.version, cmd.version);
        if (old.external_id !== cmd.values.externalId)
          throw new AppError("RUPTL Code is immutable.");
      }
      const id = old?.id ?? crypto.randomUUID(),
        data = normalizeProjectPayload({
          ...old?.data,
          ...cmd.values,
          ...(await applyProjectTemplate(tx, cmd.values, old?.data)),
          stage: old?.data.stage ?? 0,
          completed: old?.data.completed ?? false,
        });
      assertPlannedCodAssignment(data.codYear, old?.data.codYear);
      const requirementsChanged =
        old &&
        JSON.stringify(old.data.documentChecklist ?? []) !==
          JSON.stringify(data.documentChecklist);
      if (requirementsChanged) data.documentReviewNote = "";
      if (
        old &&
        (old.data.startYear !== data.startYear ||
          old.data.codYear !== data.codYear)
      ) {
        data.progressReviewedAt = null;
        data.progressReviewedBy = null;
        data.progressReviewNote = "";
      }
      if (old)
        await tx
          .update(s.boardRoomProject)
          .set({
            data,
            version: old.version + 1,
            updatedAt: new Date(),
            ...(requirementsChanged
              ? { reviewedRevision: null, reviewedBy: null, reviewedAt: null }
              : {}),
          })
          .where(eq(s.boardRoomProject.id, id));
      else
        await tx
          .insert(s.boardRoomProject)
          .values({ id, externalId: data.externalId, data });
      if (cmd.assetIds) await replaceProjectAssets(tx, actor, id, cmd.assetIds);
      if (!old && cmd.requestId)
        await tx.execute(
          sql`INSERT INTO board_creation_receipt(request_id,actor,payload_hash,project_id) VALUES(${cmd.requestId},${actor.email},${payloadHash},${id})`,
        );
      await history(
        tx,
        actor,
        id,
        old ? "project_updated" : "project_created",
        { externalId: data.externalId },
      );
      await tx
        .update(s.boardRoomConfig)
        .set({ revision: c.revision + 1 })
        .where(eq(s.boardRoomConfig.id, "primary"));
      return { project: dto(await getProject(tx, id)) };
    }
    if (
      cmd.action !== "progress" &&
      cmd.action !== "review" &&
      cmd.action !== "reviewProgress" &&
      cmd.action !== "checkDocument"
    )
      throw new AppError("Unsupported command.");
    const old = await getProject(tx, cmd.id, true);
    fresh(old.version, cmd.version);
    if (cmd.action === "reviewProgress") {
      const now = new Date();
      await tx
        .update(s.boardRoomProject)
        .set({
          data: {
            ...old.data,
            progressReviewedAt: now.toISOString(),
            progressReviewedBy: actor.email,
            progressReviewNote: cmd.note,
          },
          version: old.version + 1,
          updatedAt: now,
        })
        .where(eq(s.boardRoomProject.id, old.id));
      await history(tx, actor, old.id, "progress_reviewed", {
        note: cmd.note,
        stage: old.data.stage,
      });
    } else if (cmd.action === "checkDocument") {
      const checklist = [...(old.data.documentChecklist ?? [])];
      if (!checklist[cmd.index])
        throw new AppError("Document requirement not found.", 404);
      checklist[cmd.index] = { ...checklist[cmd.index], checked: cmd.checked };
      await tx
        .update(s.boardRoomProject)
        .set({
          data: {
            ...old.data,
            documentChecklist: checklist,
            documentReviewNote: "",
          },
          reviewedRevision: null,
          reviewedBy: null,
          reviewedAt: null,
          version: old.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(s.boardRoomProject.id, old.id));
      await history(tx, actor, old.id, "document_requirement_reviewed", {
        label: checklist[cmd.index].label,
        checked: cmd.checked,
      });
    } else if (cmd.action === "progress") {
      if (old.data.stage === cmd.stage && old.data.completed === cmd.completed)
        return { project: dto(old) };
      if (
        stageNeedsReason(
          old.data.stage,
          cmd.stage,
          old.data.completed,
          cmd.completed,
        ) &&
        !cmd.reason
      )
        throw new AppError("Provide a reason for a stage jump or reversal.");
      if (cmd.completed && cmd.stage !== 10)
        throw new AppError("Only stage 10 can be marked complete.");
      const data = {
        ...old.data,
        stage: cmd.stage,
        completed: cmd.completed,
        progressReviewedAt: null,
        progressReviewedBy: null,
        progressReviewNote: "",
      };
      await tx
        .update(s.boardRoomProject)
        .set({ data, version: old.version + 1, updatedAt: new Date() })
        .where(eq(s.boardRoomProject.id, old.id));
      await history(tx, actor, old.id, "progress", {
        before: { stage: old.data.stage, completed: old.data.completed },
        after: { stage: cmd.stage, completed: cmd.completed },
        reason: cmd.reason ?? "",
      });
    } else if (cmd.action === "review") {
      fresh(old.document_revision, cmd.documentRevision);
      if (cmd.valid && !Number(old.file_count))
        throw new AppError(
          "Upload at least one document before marking valid.",
        );
      await tx
        .update(s.boardRoomProject)
        .set({
          data: {
            ...old.data,
            documentReviewNote: cmd.note ?? old.data.documentReviewNote ?? "",
          },
          reviewedRevision: cmd.valid ? old.document_revision : null,
          reviewedBy: cmd.valid ? actor.email : null,
          reviewedAt: cmd.valid ? new Date() : null,
          version: old.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(s.boardRoomProject.id, old.id));
      await history(
        tx,
        actor,
        old.id,
        cmd.valid ? "validated" : "validation_revoked",
        { documentRevision: old.document_revision, note: cmd.note ?? "" },
      );
    }
    await tx
      .update(s.boardRoomConfig)
      .set({ revision: c.revision + 1 })
      .where(eq(s.boardRoomConfig.id, "primary"));
    return { project: dto(await getProject(tx, old.id)) };
  });
}
async function exportRows(actor: Actor, input: unknown) {
  const q = querySchema.parse(input);
  const { db } = await database();
  await assertActorActive(db, actor);
  const result = await db.execute(
    sql`SELECT p.data FROM board_room_project p WHERE ${boardProjectWhere(q)} ORDER BY p.external_id LIMIT 5001`,
  );
  if (result.rows.length > 5000)
    throw new AppError("Filter to at most 5,000 projects per export.");
  return result.rows.map((r) =>
    normalizeProjectPayload(r.data as ProjectPayload),
  );
}
export async function boardRoomExport(actor: Actor, input: unknown) {
  return exportProjectCSV(await exportRows(actor, input));
}
export async function boardRoomExportStream(actor: Actor, input: unknown) {
  return projectCSVStream(await exportRows(actor, input));
}
