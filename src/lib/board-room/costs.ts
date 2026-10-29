import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { AppError, requireAdmin } from "../permissions";
import type { Actor } from "../types";
import {
  projectCostOptions,
  projectCostOptionsSchema,
  type ProjectCostOption,
  type ProjectCostItem,
  type Currency,
} from "../project-model";
export type CostSnapshot = {
  projectId: string;
  name: string;
  version: number;
  options: ProjectCostOption[];
  enabled: boolean;
};
function options(row: Record<string, unknown>): ProjectCostOption[] {
  return row.cost_version == null
    ? []
    : projectCostOptions({
        costOptions: row.cost_options as ProjectCostOption[] | null,
        costItems: row.cost_items as ProjectCostItem[],
        currency: row.currency as Currency,
        budget: String(row.budget ?? "0"),
      });
}
export async function projectCosts(
  actor: Actor,
  id: string,
): Promise<CostSnapshot> {
  z.uuid().parse(id);
  const { db } = await database();
  await assertActorActive(db, actor);
  const row = (
    await db.execute(
      sql`SELECT p.id,p.data->>'name' AS name,c.cost_options,c.cost_items,c.currency,c.budget,c.cost_version,(SELECT enabled FROM connected_workspace WHERE id='primary') AS enabled FROM board_room_project p LEFT JOIN project c ON c.board_project_id=p.id WHERE p.id=${id}`,
    )
  ).rows[0];
  if (!row) throw new AppError("Project not found.", 404);
  return {
    projectId: id,
    name: String(row.name),
    version: Number(row.cost_version ?? 0),
    options: options(row),
    enabled: !!row.enabled,
  };
}
export async function saveProjectCosts(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<CostSnapshot> {
  requireAdmin(actor);
  z.uuid().parse(id);
  const c = z
    .object({
      version: z.number().int().nonnegative(),
      options: projectCostOptionsSchema,
    })
    .strict()
    .parse(input);
  const { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    for (const lock of [48201603, 48201622, 48201615])
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lock})`);
    if (
      !(
        await tx.execute(
          sql`SELECT enabled FROM connected_workspace WHERE id='primary'`,
        )
      ).rows[0].enabled
    )
      throw new AppError(
        "Connect the project workflow before editing Board project costs.",
        409,
      );
    const p = (
      await tx.execute(
        sql`SELECT id,data FROM board_room_project WHERE id=${id} FOR UPDATE`,
      )
    ).rows[0];
    if (!p) throw new AppError("Project not found.", 404);
    const row = (
      await tx.execute(
        sql`SELECT * FROM project WHERE board_project_id=${id} FOR UPDATE`,
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        "The canonical project projection is missing. Repair its connection before editing financial records.",
        409,
      );
    if (Number(row.cost_version) !== c.version)
      throw new AppError(
        "Project costs changed. Your input is preserved; review the latest version before saving.",
        409,
      );
    await tx.execute(
      sql`SELECT set_config('evolve.board_cost_write','on',true)`,
    );
    await tx.execute(
      sql`UPDATE project SET cost_options=${JSON.stringify(c.options)}::jsonb,cost_items='[]'::jsonb,budget=0,cost_version=cost_version+1 WHERE id=${String(row.id)}`,
    );
    await tx.execute(
      sql`INSERT INTO board_room_history(id,project_id,actor,kind,detail) VALUES(${crypto.randomUUID()},${id},${actor.email},'project_costs_updated',${JSON.stringify({ before: { options: options(row), budget: row.budget, currency: row.currency, items: row.cost_items }, after: { options: c.options }, version: c.version + 1 })}::jsonb)`,
    );
    await tx.execute(
      sql`UPDATE board_room_config SET revision=revision+1 WHERE id='primary'`,
    );
    await tx.execute(
      sql`UPDATE workspace_setting SET revision=revision+1 WHERE id='primary'`,
    );
    await tx.execute(sql`SELECT pg_notify('evolve_changed','project-costs')`);
    return {
      projectId: id,
      name: String((p.data as Record<string, unknown>).name),
      version: c.version + 1,
      options: c.options,
      enabled: true,
    };
  });
}
