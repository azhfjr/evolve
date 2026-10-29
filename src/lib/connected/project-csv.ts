import {
  applyProjectTemplate,
  makeTemplateContext,
} from "../project-template/service";
import { assertPlannedCodAssignment } from "../board-room/cod-policy";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { AppError, requireAdmin } from "../permissions";
import type { Actor } from "../types";
import {
  CSV_COLUMNS,
  readCSV,
  parseProjectCSV,
  mergeImportedProject,
} from "../board-room/csv";
import {
  querySchema,
  normalizeProjectPayload,
  type ProjectPayload,
} from "../board-room/model";
import { boardProjectWhere } from "../board-room/service";
import { stableJSON } from "../assets/model";
import { replaceProjectAssets } from "../assets/service";
import { stageNeedsReason } from "../board-room/health";
import { PROJECT_HEADERS } from "./project-fields";
export { PROJECT_HEADERS } from "./project-fields";
const cell = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
const safeCell = (v: unknown) =>
  cell(/^[=+@\-\t\r]/.test(String(v ?? "")) ? "'" + String(v) : v);
function stableId(value: string) {
  const h = createHash("sha256").update(value).digest("hex");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-4" +
    h.slice(13, 16) +
    "-8" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
}
export async function canonicalProjectImport(
  actor: Actor,
  input: unknown,
): Promise<unknown> {
  requireAdmin(actor);
  const c = z
    .object({
      action: z.enum(["canonicalPreview", "canonicalCommit"]),
      source: z.string().max(4 * 1024 * 1024),
      token: z.string().optional(),
      updateStages: z.boolean().default(false),
      reason: z.string().trim().max(1000).optional(),
      previewPage: z.number().int().min(1).default(1),
      mapping: z.record(z.string(), z.string()).optional(),
    })
    .parse(input);
  let parsedRows: string[][];
  try {
    parsedRows = readCSV(c.source);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  const rows = parsedRows,
    headers = rows.shift() ?? [];
  const names: Record<string, string> = {
    ...CSV_COLUMNS,
    externalId: "Project ID",
    assetCodes: "Asset RUPTL codes",
  };
  const selected = Object.entries(c.mapping ?? {}).filter(
    ([key, source]) =>
      key !== "scope" && !!source && headers.includes(source) && !!names[key],
  );
  if (new Set(selected.map(([, source]) => source)).size !== selected.length)
    throw new AppError("Use each mapped source column only once.");
  for (let i = 0; i < headers.length; i++) {
    const match = selected.find(([, source]) => source === headers[i]);
    if (match) headers[i] = names[match[0]];
  }
  if (!headers.includes("Project ID"))
    throw new AppError(
      "Use the Project ID template, or explicitly choose Legacy CSV mode.",
    );
  const idAt = headers.indexOf("Project ID"),
    assetAt = headers.indexOf("Asset RUPTL codes");
  const ids = rows.map(
    (r, i) => r[idAt]?.trim() || stableId(actor.email + c.source + i),
  );
  for (const id of ids) z.uuid().parse(id);
  const transformed = [
    headers.map(cell).join(","),
    ...rows.map((r, i) =>
      r.map((v, k) => cell(k === idAt ? ids[i] : v)).join(","),
    ),
  ].join("\n");
  let patches: ReturnType<typeof parseProjectCSV>;
  try {
    patches = parseProjectCSV(transformed);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  if (patches.length > 5000)
    throw new AppError("Split this CSV into at most 5,000 projects.");
  const { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201622)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201615)`);
    const hash = createHash("sha256")
      .update(stableJSON([c.source, c.mapping ?? {}, c.updateStages, c.reason]))
      .digest("hex");
    if (c.action === "canonicalCommit" && c.token) {
      const receipt = (
        await tx.execute(
          sql`SELECT actor,source_hash,result FROM canonical_import_receipt WHERE token=${c.token}`,
        )
      ).rows[0];
      if (receipt) {
        if (receipt.actor !== actor.email || receipt.source_hash !== hash)
          throw new AppError("Import request changed.", 409);
        return receipt.result;
      }
    }
    const templateContext = await makeTemplateContext(tx);
    const changes = [];
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i].patch,
        id = ids[i];
      const old = (
        await tx.execute(
          sql`SELECT * FROM board_room_project WHERE id=${id} FOR UPDATE`,
        )
      ).rows[0];
      if (rows[i][idAt]?.trim() && !old)
        throw new AppError(
          `Row ${i + 2}: Project ID does not exist. Leave it blank for a new project.`,
        );
      let values = mergeImportedProject(
        old ? normalizeProjectPayload(old.data as ProjectPayload) : undefined,
        { ...patch, externalId: old ? String(old.external_id) : "PRJ-" + id },
        c.updateStages,
      );
      values = {
        ...values,
        ...(await applyProjectTemplate(
          tx,
          values,
          old ? normalizeProjectPayload(old.data as ProjectPayload) : undefined,
          templateContext,
        )),
      };
      try {
        assertPlannedCodAssignment(
          values.codYear,
          old
            ? normalizeProjectPayload(old.data as ProjectPayload).codYear
            : undefined,
        );
      } catch (error) {
        throw new AppError(`Row ${i + 2}: ${(error as Error).message}`);
      }
      const currentAssets = (
        await tx.execute(
          sql`SELECT id,code,version FROM board_asset WHERE project_id=${id} ORDER BY code FOR UPDATE`,
        )
      ).rows;
      let assets = currentAssets;
      if (assetAt >= 0 && rows[i][assetAt]?.trim()) {
        const codes = rows[i][assetAt]
          .split(";")
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean);
        if (new Set(codes).size !== codes.length)
          throw new AppError(`Row ${i + 2}: duplicate asset code.`);
        assets = [];
        for (const code of codes) {
          const a = (
            await tx.execute(
              sql`SELECT id,code,version,project_id FROM board_asset WHERE code=${code} FOR UPDATE`,
            )
          ).rows[0];
          if (!a)
            throw new AppError(
              `Row ${i + 2}: unknown asset ${code}. Import assets first.`,
            );
          if (a.project_id && a.project_id !== id)
            throw new AppError(
              `Asset ${code} is assigned to another project. Reassign explicitly first.`,
              409,
            );
          assets.push(a);
        }
      }
      const changed =
        !old ||
        stableJSON(
          normalizeProjectPayload({
            ...(old.data as ProjectPayload),
            templateRevision:
              (old.data as ProjectPayload).templateRevision ?? 0,
            customValues: (old.data as ProjectPayload).customValues ?? {},
          }),
        ) !== stableJSON(values) ||
        JSON.stringify(currentAssets.map((a) => a.id)) !==
          JSON.stringify(assets.map((a) => a.id));
      const requiresReason =
        !!old &&
        stageNeedsReason(
          Number((old.data as ProjectPayload).stage),
          values.stage,
          Boolean((old.data as ProjectPayload).completed),
          values.completed,
        );
      changes.push({
        row: i + 2,
        id,
        externalId: id,
        name: values.name,
        kind: !old ? "New" : changed ? "Updated" : "Unchanged",
        fields: Object.entries(values)
          .filter(
            ([field, value]) =>
              !["scope", "documentChecklist", "externalId"].includes(field) &&
              stableJSON(
                (old?.data as Record<string, unknown> | undefined)?.[field],
              ) !== stableJSON(value),
          )
          .map(([field, value]) => ({
            field,
            before: String(
              (old?.data as Record<string, unknown> | undefined)?.[field] ?? "",
            ),
            after:
              typeof value === "object"
                ? JSON.stringify(value)
                : String(value ?? ""),
          })),
        values,
        assets,
        version: old?.version ?? null,
        requiresReason,
      });
    }
    const config = (
      await tx.execute(
        sql`SELECT version FROM board_room_config WHERE id='primary'`,
      )
    ).rows[0];
    const token = createHash("sha256")
      .update(JSON.stringify([actor.email, hash, config, changes]))
      .digest("hex");
    const preview = {
      token,
      counts: {
        new: changes.filter((x) => x.kind === "New").length,
        updated: changes.filter((x) => x.kind === "Updated").length,
        unchanged: changes.filter((x) => x.kind === "Unchanged").length,
      },
      rows: changes.slice((c.previewPage - 1) * 100, c.previewPage * 100),
      page: c.previewPage,
      pageSize: 100,
      total: changes.length,
      requiresReason: changes.some((x) => x.requiresReason),
    };
    if (c.action === "canonicalPreview") return preview;
    if (c.token !== token)
      throw new AppError(
        "Projects or assets changed since preview. Preview this CSV again.",
        409,
      );
    if (preview.requiresReason && !c.reason)
      throw new AppError("Provide a reason for stage jumps or reversals.");
    const batch = crypto.randomUUID();
    for (const x of changes) {
      if (x.kind === "Unchanged") continue;
      if (x.version)
        await tx.execute(
          sql`UPDATE board_room_project SET data=${JSON.stringify(x.values)}::jsonb,version=version+1,updated_at=now() WHERE id=${x.id}`,
        );
      else
        await tx.execute(
          sql`INSERT INTO board_room_project(id,external_id,data) VALUES(${x.id},${x.values.externalId},${JSON.stringify(x.values)}::jsonb)`,
        );
      await replaceProjectAssets(
        tx,
        actor,
        x.id,
        x.assets.map((a) => String(a.id)),
      );
      await tx.execute(
        sql`INSERT INTO board_room_history(id,project_id,actor,kind,detail) VALUES(${crypto.randomUUID()},${x.id},${actor.email},'csv_import',${JSON.stringify({ batchId: batch, totals: preview.counts, reason: c.reason ?? "", identity: "Project ID" })}::jsonb)`,
      );
    }
    await tx.execute(
      sql`UPDATE board_room_config SET revision=revision+1 WHERE id='primary'`,
    );
    const result = { ...preview, ok: true };
    await tx.execute(
      sql`INSERT INTO canonical_import_receipt(token,actor,source_hash,result) VALUES(${token},${actor.email},${hash},${JSON.stringify(result)}::jsonb)`,
    );
    return result;
  });
}
export async function canonicalProjectExport(actor: Actor, input: unknown) {
  const q = querySchema.parse(input),
    { db } = await database();
  await assertActorActive(db, actor);
  const rows = await db.execute(
    sql`SELECT p.id,p.data,(SELECT string_agg(a.code,';' ORDER BY a.code) FROM board_asset a WHERE a.project_id=p.id) AS codes FROM board_room_project p WHERE ${boardProjectWhere(q)} ORDER BY p.id LIMIT 5001`,
  );
  if (rows.rows.length > 5000)
    throw new AppError("Filter to at most 5,000 projects per export.");
  const keys = Object.keys(CSV_COLUMNS).filter(
    (k) => k !== "externalId" && k !== "scope",
  );
  return [
    PROJECT_HEADERS.map(cell).join(","),
    ...rows.rows.map((r) => {
      const d = r.data as Record<string, unknown>;
      return [
        r.id,
        ...keys.map((k) =>
          d[k] && typeof d[k] === "object" ? JSON.stringify(d[k]) : d[k],
        ),
        r.codes ?? "",
      ]
        .map(safeCell)
        .join(",");
    }),
  ].join("\r\n");
}

export function canonicalCSVStream(source: string) {
  const encoder = new TextEncoder();
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= source.length) {
        controller.close();
        return;
      }
      let end = Math.min(offset + 16000, source.length);
      if (
        end < source.length &&
        source.charCodeAt(end - 1) >= 0xd800 &&
        source.charCodeAt(end - 1) <= 0xdbff
      )
        end--;
      controller.enqueue(encoder.encode(source.slice(offset, end)));
      offset = end;
    },
  });
}
