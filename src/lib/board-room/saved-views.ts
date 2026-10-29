import { sql } from "drizzle-orm";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { ensureWorkspaceProfile } from "../workspace-experience";
import { AppError } from "../permissions";
import type { Actor } from "../types";
import {
  boardViewCreateSchema,
  boardViewUpdateSchema,
  boardViewDeleteSchema,
  type BoardSavedView,
} from "./saved-views-model";
export async function readBoardViews(actor: Actor) {
  await ensureWorkspaceProfile(actor);
  const { db } = await database();
  await assertActorActive(db, actor);
  const result = await db.execute(
    sql`SELECT id,name,version,filters FROM board_saved_view WHERE owner_email=${actor.email} ORDER BY lower(name),id LIMIT 20`,
  );
  return { views: result.rows as unknown as BoardSavedView[] };
}
export async function boardViewCommand(
  actor: Actor,
  action: "create" | "update" | "delete",
  input: unknown,
) {
  const command =
    action === "create"
      ? boardViewCreateSchema.parse(input)
      : action === "update"
        ? boardViewUpdateSchema.parse(input)
        : boardViewDeleteSchema.parse(input);
  await ensureWorkspaceProfile(actor);
  const { db } = await database();
  try {
    return await db.transaction(async (tx) => {
      await assertActorActive(tx, actor);
      // Serialize each owner's changes, including the twenty-view quota.
      await tx.execute(
        sql`SELECT email FROM member WHERE email=${actor.email} FOR UPDATE`,
      );
      if (action === "create") {
        const value = boardViewCreateSchema.parse(command);
        const count = await tx.execute(
          sql`SELECT count(*)::int AS count FROM board_saved_view WHERE owner_email=${actor.email}`,
        );
        if (Number(count.rows[0].count) >= 20)
          throw new AppError(
            "You can save up to 20 Board views. Remove an unused view first.",
          );
        const result = await tx.execute(
          sql`INSERT INTO board_saved_view(id,owner_email,name,filters) VALUES(${crypto.randomUUID()},${actor.email},${value.name},${JSON.stringify(value.filters)}::jsonb) RETURNING id,name,version,filters`,
        );
        return { view: result.rows[0] as unknown as BoardSavedView };
      }
      const key = boardViewDeleteSchema.parse({
        id: (command as { id: string }).id,
        version: (command as { version: number }).version,
      });
      const result = await tx.execute(
        sql`SELECT id,name,version,filters FROM board_saved_view WHERE id=${key.id} AND owner_email=${actor.email}`,
      );
      const old = result.rows[0] as unknown as BoardSavedView | undefined;
      if (!old) throw new AppError("Saved view not found.", 404);
      if (old.version !== key.version)
        throw new AppError(
          "This saved view changed. Refresh and retry; your input is preserved.",
          409,
        );
      if (action === "delete") {
        const deleted = await tx.execute(
          sql`DELETE FROM board_saved_view WHERE id=${key.id} AND owner_email=${actor.email} AND version=${key.version} RETURNING id`,
        );
        if (!deleted.rows.length)
          throw new AppError(
            "This saved view changed. Refresh and retry.",
            409,
          );
        return { deletedViewId: key.id };
      }
      const value = boardViewUpdateSchema.parse(command);
      const updated = await tx.execute(
        sql`UPDATE board_saved_view SET name=${value.name ?? old.name},filters=${JSON.stringify(value.filters ?? old.filters)}::jsonb,version=version+1,updated_at=now() WHERE id=${key.id} AND owner_email=${actor.email} AND version=${key.version} RETURNING id,name,version,filters`,
      );
      if (!updated.rows.length)
        throw new AppError(
          "This saved view changed. Refresh and retry; your input is preserved.",
          409,
        );
      return { view: updated.rows[0] as unknown as BoardSavedView };
    });
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (failure.code === "23505" || failure.cause?.code === "23505")
      throw new AppError(
        "You already have a Board saved view with this name.",
        409,
      );
    throw error;
  }
}
