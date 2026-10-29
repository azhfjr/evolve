import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { database, type Database } from "../db";
import { assertActorActive } from "../membership";
import { AppError, requireAdmin } from "../permissions";
import type { Actor } from "../types";
import { stableJSON } from "../assets/model";
import {
  templateDefinitionSchema,
  assertPublishedIdentities,
  validateCustomValues,
  type TemplateDefinition,
  type CustomValues,
} from "./model";
type DB = Pick<Database, "execute">;
export type TemplateView = {
  version: number;
  publishedRevision: number;
  revision: number;
  definition: TemplateDefinition;
  values: CustomValues;
  draft?: TemplateDefinition;
  pendingUpdate: boolean;
};
export async function definitionAt(
  db: DB,
  revision: number,
): Promise<TemplateDefinition> {
  const row = (
    await db.execute(
      sql`SELECT definition FROM project_template_revision WHERE revision=${revision}`,
    )
  ).rows[0];
  if (!row)
    throw new AppError(
      "Project template revision is unavailable. Refresh before editing.",
      409,
    );
  return templateDefinitionSchema.parse(row.definition);
}
export async function makeTemplateContext(db: DB) {
  const config = (
    await db.execute(
      sql`SELECT published_revision FROM project_template_config WHERE id='primary'`,
    )
  ).rows[0];
  const cache = new Map<number, Promise<TemplateDefinition>>();
  return {
    publishedRevision: Number(config.published_revision),
    definition(revision: number) {
      if (!cache.has(revision)) cache.set(revision, definitionAt(db, revision));
      return cache.get(revision)!;
    },
  };
}
export async function applyProjectTemplate(
  db: DB,
  values: { templateRevision?: number; customValues?: CustomValues },
  previous?: { templateRevision?: number; customValues?: CustomValues },
  context?: Awaited<ReturnType<typeof makeTemplateContext>>,
) {
  const template = context ?? (await makeTemplateContext(db));
  const revision =
    previous?.templateRevision ?? (previous ? 0 : template.publishedRevision);
  if (
    values.templateRevision !== undefined &&
    values.templateRevision !== revision
  )
    throw new AppError(
      "Project template changed. Refresh the definition and review your input before saving.",
      409,
    );
  const def = await template.definition(revision);
  return {
    templateRevision: revision,
    customValues: validateCustomValues(
      def,
      values.customValues ?? previous?.customValues ?? {},
      previous?.customValues ?? {},
      !previous,
    ),
  };
}
export async function readTemplate(
  actor: Actor,
  id?: string,
  manage = false,
): Promise<TemplateView> {
  const { db } = await database();
  await assertActorActive(db, actor);
  if (manage) requireAdmin(actor);
  const config = (
    await db.execute(
      sql`SELECT * FROM project_template_config WHERE id='primary'`,
    )
  ).rows[0];
  let revision = Number(config.published_revision),
    values: CustomValues = {};
  if (id) {
    z.uuid().parse(id);
    const p = (
      await db.execute(sql`SELECT data FROM board_room_project WHERE id=${id}`)
    ).rows[0];
    if (!p) throw new AppError("Project not found.", 404);
    const data = p.data as {
      templateRevision?: number;
      customValues?: CustomValues;
    };
    revision = data.templateRevision ?? 0;
    values = data.customValues ?? {};
  }
  return {
    version: Number(config.version),
    publishedRevision: Number(config.published_revision),
    revision,
    definition: await definitionAt(db, revision),
    values,
    ...(manage ? { draft: templateDefinitionSchema.parse(config.draft) } : {}),
    pendingUpdate: revision !== Number(config.published_revision),
  };
}
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("saveDraft"),
      version: z.number().int().positive(),
      definition: templateDefinitionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      version: z.number().int().positive(),
    })
    .strict(),
  z.object({ action: z.literal("syncPreview") }).strict(),
  z
    .object({
      action: z.literal("syncCommit"),
      token: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type TemplateResult = {
  version: number;
  publishedRevision: number;
  token?: string;
  changedProjects: number;
  totalProjects: number;
  newFields: number;
  renamedFields: number;
  renamedOptions: number;
  deactivatedOptions: number;
  deactivatedFields: number;
  incompatibleValues: number;
  requiredUnset: number;
  sample: { id: string; name: string }[];
  synced?: boolean;
};
export async function templateCommand(
  actor: Actor,
  input: unknown,
): Promise<TemplateResult> {
  requireAdmin(actor);
  const c = commandSchema.parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    for (const lock of [48201603, 48201622, 48201615])
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lock})`);
    const config = (
      await tx.execute(
        sql`SELECT * FROM project_template_config WHERE id='primary' FOR UPDATE`,
      )
    ).rows[0];
    let version = Number(config.version),
      revision = Number(config.published_revision);
    const blank: TemplateResult = {
      version,
      publishedRevision: revision,
      changedProjects: 0,
      totalProjects: 0,
      newFields: 0,
      renamedFields: 0,
      renamedOptions: 0,
      deactivatedOptions: 0,
      deactivatedFields: 0,
      incompatibleValues: 0,
      requiredUnset: 0,
      sample: [],
    };
    const audit = async (kind: string, detail: unknown) => {
      await tx.execute(
        sql`INSERT INTO project_template_audit(id,kind,actor,revision,detail) VALUES(${crypto.randomUUID()},${kind},${actor.email},${revision},${JSON.stringify(detail)}::jsonb)`,
      );
      await tx.execute(
        sql`UPDATE board_room_config SET revision=revision+1 WHERE id='primary'`,
      );
      await tx.execute(
        sql`UPDATE workspace_setting SET revision=revision+1 WHERE id='primary'`,
      );
      await tx.execute(
        sql`SELECT pg_notify('evolve_changed','project-template')`,
      );
    };
    if (c.action === "saveDraft" || c.action === "publish") {
      if (c.version !== version)
        throw new AppError(
          "The template changed. Your input is preserved; reload the latest definition before saving.",
          409,
        );
      const definition =
        c.action === "saveDraft"
          ? c.definition
          : templateDefinitionSchema.parse(config.draft);
      assertPublishedIdentities(await definitionAt(tx, revision), definition);
      if (c.action === "saveDraft")
        await tx.execute(
          sql`UPDATE project_template_config SET draft=${JSON.stringify(definition)}::jsonb,version=version+1 WHERE id='primary'`,
        );
      else {
        revision++;
        await tx.execute(
          sql`INSERT INTO project_template_revision(revision,definition,created_by) VALUES(${revision},${JSON.stringify(definition)}::jsonb,${actor.email})`,
        );
        await tx.execute(
          sql`UPDATE project_template_config SET published_revision=${revision},version=version+1 WHERE id='primary'`,
        );
      }
      version++;
      await audit(c.action, { definition });
      return { ...blank, version, publishedRevision: revision };
    }
    if (c.action === "syncCommit") {
      const receipt = (
        await tx.execute(
          sql`SELECT actor,result FROM project_template_sync_receipt WHERE token=${c.token}`,
        )
      ).rows[0];
      if (receipt) {
        if (receipt.actor !== actor.email)
          throw new AppError(
            "This sync belongs to another administrator.",
            403,
          );
        return receipt.result as TemplateResult;
      }
    }
    const def = await definitionAt(tx, revision);
    const rows = (
      await tx.execute(
        sql`SELECT id,data,version FROM board_room_project ORDER BY id`,
      )
    ).rows;
    const changed = rows.filter(
      (row) =>
        Number((row.data as Record<string, unknown>).templateRevision ?? 0) !==
        revision,
    );
    const definitions = new Map<number, TemplateDefinition>();
    for (const row of changed) {
      const old = Number(
        (row.data as Record<string, unknown>).templateRevision ?? 0,
      );
      if (!definitions.has(old))
        definitions.set(old, await definitionAt(tx, old));
    }
    let added = 0,
      renamed = 0,
      renamedOptions = 0,
      deactivatedOptions = 0,
      deactivated = 0,
      incompatible = 0,
      requiredUnset = 0;
    for (const row of changed) {
      const data = row.data as {
        templateRevision?: number;
        customValues?: CustomValues;
      };
      const previous = definitions.get(data.templateRevision ?? 0)!;
      for (const field of def.fields) {
        const old = previous.fields.find((f) => f.key === field.key);
        if (!old) added++;
        else if (old.label !== field.label) renamed++;
        if (old?.active && !field.active) deactivated++;
        for (const option of field.options) {
          const previous = old?.options.find((o) => o.id === option.id);
          if (previous && previous.label !== option.label) renamedOptions++;
          if (previous?.active && !option.active) deactivatedOptions++;
        }
        const value = data.customValues?.[field.key];
        if (value && !field.options.some((o) => o.id === value && o.active))
          incompatible++;
        if (field.active && field.required && !value) requiredUnset++;
      }
    }
    const token = createHash("sha256")
      .update(
        stableJSON({
          revision,
          projects: rows.map((row) => [row.id, row.version, row.data]),
        }),
      )
      .digest("hex");
    const result: TemplateResult = {
      ...blank,
      token,
      changedProjects: changed.length,
      totalProjects: rows.length,
      newFields: added,
      renamedFields: renamed,
      renamedOptions,
      deactivatedOptions,
      deactivatedFields: deactivated,
      incompatibleValues: incompatible,
      requiredUnset,
      sample: changed.slice(0, 50).map((row) => ({
        id: String(row.id),
        name: String((row.data as Record<string, unknown>).name),
      })),
    };
    if (c.action === "syncPreview") return result;
    if (c.token !== token)
      throw new AppError(
        "Projects or the published template changed after preview. Preview synchronization again.",
        409,
      );
    await tx.execute(
      sql`WITH changed AS (UPDATE board_room_project SET data=jsonb_set(data,'{templateRevision}',to_jsonb(${revision}::int)),version=version+1,updated_at=now() WHERE coalesce((data->>'templateRevision')::int,0)<>${revision} RETURNING id) INSERT INTO board_room_history(id,project_id,actor,kind,detail) SELECT md5(${crypto.randomUUID()}||id),id,${actor.email},'template_synced',jsonb_build_object('revision',${revision}::int) FROM changed`,
    );
    await audit("sync", { ...result, token: undefined });
    const done = { ...result, synced: true };
    await tx.execute(
      sql`INSERT INTO project_template_sync_receipt(token,actor,result) VALUES(${token},${actor.email},${JSON.stringify(done)}::jsonb)`,
    );
    return done;
  });
}
