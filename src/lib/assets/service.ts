import { querySchema } from "../board-room/model";
import { boardProjectWhere } from "../board-room/project-query";
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { AppError, requireAdmin } from "../permissions";
import type { Actor } from "../types";
import {
  assetSchema,
  stableJSON,
  parseAssetCSV,
  type Asset,
  type AssetValues,
} from "./model";
type DB = Awaited<ReturnType<typeof database>>["db"];
type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Row = {
  id: string;
  code: string;
  project_id: string | null;
  data: Omit<AssetValues, "code" | "projectId">;
  version: number;
  updated_at: Date;
  project_name?: string;
};
const query = z.object({
  unit: z.string().max(30).default(""),
  projectScope: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }, querySchema.optional()),
  q: z.string().trim().max(200).default(""),
  id: z.uuid().optional(),
  projectId: z.union([z.uuid(), z.literal("unassigned")]).optional(),
  category: z.string().max(60).default(""),
  location: z.string().max(160).default(""),
  voltage: z.string().max(120).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
function dto(r: Row): Asset {
  return {
    ...r.data,
    id: r.id,
    code: r.code,
    projectId: r.project_id,
    version: r.version,
    updatedAt: new Date(r.updated_at).toISOString(),
    projectName: r.project_name ?? null,
  };
}
export async function queryAssets(actor: Actor, input: unknown) {
  const q = query.parse(input),
    { db } = await database();
  await assertActorActive(db, actor);
  const conditions: SQL[] = [sql`TRUE`];
  if (q.unit) conditions.push(sql`a.data->>'unit'=${q.unit}`);
  if (q.projectScope)
    conditions.push(
      sql`EXISTS(SELECT 1 FROM board_room_project p WHERE p.id=a.project_id AND ${boardProjectWhere(q.projectScope)})`,
    );
  if (q.id) conditions.push(sql`a.id=${q.id}`);
  if (q.q) {
    const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
    conditions.push(
      sql`(a.code ILIKE ${term} OR a.data->>'name' ILIKE ${term})`,
    );
  }
  if (q.projectId)
    conditions.push(
      q.projectId === "unassigned"
        ? sql`a.project_id IS NULL`
        : sql`a.project_id=${q.projectId}`,
    );
  for (const key of ["category", "location", "voltage"] as const)
    if (q[key]) conditions.push(sql`a.data->>${key}=${q[key]}`);
  const where = sql.join(conditions, sql` AND `);
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute(
        sql`SELECT a.*,p.data->>'name' AS project_name FROM board_asset a LEFT JOIN board_room_project p ON p.id=a.project_id WHERE ${where} ORDER BY a.code LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      );
      const counts = await tx.execute(
        sql`SELECT count(*)::int AS total FROM board_asset a WHERE ${where}`,
      );
      return {
        items: (rows.rows as unknown as Row[]).map(dto),
        total: Number(counts.rows[0].total),
        page: q.page,
        pageSize: q.limit,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
const version = z.number().int().positive();
const clearField = z.enum([
  "capacity",
  "unit",
  "location",
  "voltage",
  "projectId",
]);
const command = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("resolveFinding"), id: z.uuid(), version })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      id: z.uuid().optional(),
      version: version.optional(),
      values: assetSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("assign"),
      id: z.uuid(),
      version,
      projectId: z.uuid().nullable(),
    })
    .strict(),
  z.object({ action: z.literal("delete"), id: z.uuid(), version }).strict(),
  z
    .object({
      action: z.enum(["preview", "commit"]),
      source: z.string().max(4 * 1024 * 1024),
      mapping: z.record(z.string(), z.string()).optional(),
      clear: z.record(z.string(), z.array(clearField)).default({}),
      token: z.string().max(100).optional(),
      confirmAssignments: z.boolean().default(false),
    })
    .strict(),
]);
async function projectExists(tx: TX, id: string | null) {
  if (
    id &&
    !(
      await tx.execute(
        sql`SELECT id FROM board_room_project WHERE id=${id} FOR SHARE`,
      )
    ).rows.length
  )
    throw new AppError("Unknown project. Refresh project choices.", 409);
}
async function row(tx: TX, id: string) {
  const r = (
    await tx.execute(sql`SELECT * FROM board_asset WHERE id=${id} FOR UPDATE`)
  ).rows[0] as unknown as Row | undefined;
  if (!r) throw new AppError("Asset not found.", 404);
  return r;
}
async function save(tx: TX, actor: Actor, values: AssetValues, before?: Row) {
  await projectExists(tx, values.projectId);
  const { code, projectId, ...data } = values;
  const id = before?.id ?? crypto.randomUUID();
  if (before)
    await tx.execute(
      sql`UPDATE board_asset SET data=${JSON.stringify(data)}::jsonb,project_id=${projectId},version=version+1,updated_at=now() WHERE id=${id}`,
    );
  else
    await tx.execute(
      sql`INSERT INTO board_asset(id,code,project_id,data) VALUES(${id},${code},${projectId},${JSON.stringify(data)}::jsonb)`,
    );
  await tx.execute(
    sql`INSERT INTO asset_history(id,asset_id,actor,kind,detail) VALUES(${crypto.randomUUID()},${id},${actor.email},${before ? "updated" : "created"},${JSON.stringify({ before: before ? dto(before) : null, after: values })}::jsonb)`,
  );
  if ((before?.project_id ?? null) !== projectId) {
    const affected = [
      ...new Set(
        [before?.project_id, projectId].filter((id): id is string => !!id),
      ),
    ];
    for (const target of affected)
      await tx.execute(
        sql`UPDATE board_room_project SET version=version+1,updated_at=now() WHERE id=${target}`,
      );
  }
  return dto(await row(tx, id));
}
export async function assetCommand(
  actor: Actor,
  input: unknown,
): Promise<unknown> {
  requireAdmin(actor);
  const cmd = command.parse(input),
    { db } = await database();
  try {
    return await db.transaction(async (tx) => {
      await assertActorActive(tx, actor);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(48201622)`);
      if (cmd.action === "resolveFinding") {
        const resolved = await tx.execute(
          sql`UPDATE asset_import_finding SET resolved=true,resolved_by=${actor.email},version=version+1 WHERE id=${cmd.id} AND version=${cmd.version} AND NOT resolved RETURNING id`,
        );
        if (!resolved.rows.length)
          throw new AppError("Finding changed. Refresh the workbench.", 409);
        return { resolved: cmd.id };
      }
      if (cmd.action === "save") {
        const old = cmd.id ? await row(tx, cmd.id) : undefined;
        if (old && old.version !== cmd.version)
          throw new AppError("Asset changed. Reopen it before saving.", 409);
        if (old && old.code !== cmd.values.code)
          throw new AppError("RUPTL code is immutable.");
        if (old && old.project_id !== cmd.values.projectId)
          throw new AppError(
            "Use explicit reassignment to move this asset.",
            409,
          );
        return { asset: await save(tx, actor, cmd.values, old) };
      }
      if (cmd.action === "assign" || cmd.action === "delete") {
        const old = await row(tx, cmd.id);
        if (old.version !== cmd.version)
          throw new AppError("Asset changed. Refresh before continuing.", 409);
        if (cmd.action === "assign")
          return {
            asset: await save(
              tx,
              actor,
              assetSchema.parse({
                ...old.data,
                code: old.code,
                projectId: cmd.projectId,
              }),
              old,
            ),
          };
        if (old.project_id)
          throw new AppError(
            "Unlink this connected asset before deleting.",
            409,
          );
        await tx.execute(sql`DELETE FROM board_asset WHERE id=${old.id}`);
        return { deleted: old.id };
      }
      let rows: ReturnType<typeof parseAssetCSV>;
      try {
        rows = parseAssetCSV(cmd.source, cmd.mapping);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      if (rows.length > 5000)
        throw new AppError("Split this CSV into at most 5,000 assets.");
      const inputHash = createHash("sha256")
        .update(
          stableJSON([
            cmd.source,
            cmd.mapping ?? {},
            cmd.clear,
            cmd.confirmAssignments,
          ]),
        )
        .digest("hex");
      if (cmd.action === "commit" && cmd.token) {
        const receipt = (
          await tx.execute(
            sql`SELECT result,input_hash FROM asset_import_receipt WHERE token=${cmd.token} AND actor=${actor.email}`,
          )
        ).rows[0];
        if (receipt) {
          if (receipt.input_hash && receipt.input_hash !== inputHash)
            throw new AppError(
              "Import request changed. Preview the new source again.",
              409,
            );
          return receipt.result;
        }
      }
      const all = (
        await tx.execute(
          sql`SELECT * FROM board_asset ORDER BY code FOR UPDATE`,
        )
      ).rows as unknown as Row[];
      const byCode = new Map(all.map((r) => [r.code, r]));
      const changes = [];
      for (const item of rows) {
        const old = byCode.get(item.values.code);
        const fields = {
          ...(old ? { ...old.data, projectId: old.project_id } : {}),
          ...item.values,
        };
        for (const f of cmd.clear[item.values.code] ?? [])
          fields[f] = (
            f === "capacity" || f === "projectId" ? null : ""
          ) as never;
        const values = assetSchema.parse(fields);
        await projectExists(tx, values.projectId);
        const previous = old
          ? { ...old.data, code: old.code, projectId: old.project_id }
          : null;
        changes.push({
          row: item.row,
          code: values.code,
          id: old?.id,
          version: old?.version,
          values,
          kind: old
            ? stableJSON(previous) === stableJSON(values)
              ? "Unchanged"
              : "Updated"
            : "New",
          fields: Object.entries(values)
            .filter(
              ([field, value]) =>
                stableJSON(
                  (previous as Record<string, unknown> | null)?.[field],
                ) !== stableJSON(value),
            )
            .map(([field, value]) => ({
              field,
              before:
                (previous as Record<string, unknown> | null)?.[field] ?? null,
              after: value,
            })),
          reassignment: !!old && old.project_id !== values.projectId,
        });
      }
      const token = createHash("sha256")
        .update(
          JSON.stringify([
            actor.email,
            cmd.source,
            cmd.mapping,
            cmd.clear,
            changes,
          ]),
        )
        .digest("hex");
      const preview = {
        token,
        rows: changes,
        total: changes.length,
        counts: {
          new: changes.filter((c) => c.kind === "New").length,
          updated: changes.filter((c) => c.kind === "Updated").length,
          unchanged: changes.filter((c) => c.kind === "Unchanged").length,
        },
        requiresAssignmentConfirmation: changes.some((c) => c.reassignment),
      };
      if (cmd.action === "preview") return preview;
      if (cmd.token !== token)
        throw new AppError(
          "Assets changed since preview. Preview this CSV again.",
          409,
        );
      if (preview.requiresAssignmentConfirmation && !cmd.confirmAssignments)
        throw new AppError(
          "Confirm the asset assignment changes shown in preview.",
        );
      for (const change of changes)
        if (change.kind !== "Unchanged")
          await save(
            tx,
            actor,
            change.values,
            change.id ? byCode.get(change.code) : undefined,
          );
      const sourceHash = createHash("sha256").update(cmd.source).digest("hex");
      await tx.execute(
        sql`UPDATE asset_import_finding SET resolved=true WHERE source_hash=${sourceHash}`,
      );
      const result = { ...preview, committed: true };
      await tx.execute(
        sql`INSERT INTO asset_import_receipt(token,actor,result,input_hash) VALUES(${token},${actor.email},${JSON.stringify(result)}::jsonb,${inputHash})`,
      );
      return result;
    });
  } catch (e) {
    if (cmd.action === "preview" || cmd.action === "commit") {
      const message =
        e instanceof AppError
          ? e.message
          : e instanceof z.ZodError
            ? e.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : "Import failed. Review the file and preview again.";
      await db.execute(
        sql`INSERT INTO asset_import_finding(id,actor,source_hash,message) VALUES(${crypto.randomUUID()},${actor.email},${createHash("sha256").update(cmd.source).digest("hex")},${message.slice(0, 2000)})`,
      );
    }
    if (
      (e as { code?: string }).code === "23505" ||
      (e as { cause?: { code?: string } }).cause?.code === "23505"
    )
      throw new AppError("RUPTL Code already exists.", 409);
    throw e;
  }
}

export async function replaceProjectAssets(
  tx: TX,
  actor: Actor,
  projectId: string,
  ids: string[],
) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length)
    throw new AppError("Asset selection contains duplicates.");
  const existing = (
    await tx.execute(
      sql`SELECT * FROM board_asset WHERE project_id=${projectId} OR id IN (${
        unique.length
          ? sql.join(
              unique.map((id) => sql`${id}`),
              sql`, `,
            )
          : sql`NULL`
      }) FOR UPDATE`,
    )
  ).rows as unknown as Row[];
  for (const id of unique) {
    const asset = existing.find((a) => a.id === id);
    if (!asset) throw new AppError("Selected asset no longer exists.", 409);
    if (asset.project_id && asset.project_id !== projectId)
      throw new AppError(
        "Asset is already assigned to another project. Use explicit reassignment.",
        409,
      );
  }
  for (const asset of existing) {
    const next = unique.includes(asset.id) ? projectId : null;
    if (next !== asset.project_id)
      await save(
        tx,
        actor,
        { ...asset.data, code: asset.code, projectId: next },
        asset,
      );
  }
}
