import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../db";
import { assertActorActive } from "../membership";
import { AppError } from "../permissions";
import type { Actor } from "../types";
export async function personalProjects(actor: Actor) {
  const { db } = await database();
  await assertActorActive(db, actor);
  const result = await db.execute(
    sql`SELECT f.project_id AS id,p.data->>'name' AS name,f.pinned,f.version,f.last_opened_at AS "lastOpenedAt" FROM personal_project f JOIN board_room_project p ON p.id=f.project_id WHERE f.email=${actor.email} ORDER BY f.pinned DESC,f.last_opened_at DESC LIMIT 100`,
  );
  return { items: result.rows };
}
export async function personalProjectCommand(actor: Actor, input: unknown) {
  const cmd = z
      .object({
        action: z.enum(["visit", "pin"]),
        id: z.uuid(),
        pinned: z.boolean().optional(),
        version: z.number().int().nonnegative().default(0),
      })
      .strict()
      .parse(input),
    { db } = await database();
  return db.transaction(async (tx) => {
    await assertActorActive(tx, actor);
    if (
      !(
        await tx.execute(
          sql`SELECT id FROM board_room_project WHERE id=${cmd.id}`,
        )
      ).rows.length
    )
      throw new AppError("Project no longer available.", 404);
    if (cmd.action === "visit") {
      await tx.execute(
        sql`INSERT INTO personal_project(email,project_id) VALUES(${actor.email},${cmd.id}) ON CONFLICT(email,project_id) DO UPDATE SET last_opened_at=now()`,
      );
      return { visited: true };
    }
    const current = (
      await tx.execute(
        sql`SELECT version FROM personal_project WHERE email=${actor.email} AND project_id=${cmd.id} FOR UPDATE`,
      )
    ).rows[0];
    if (Number(current?.version ?? 0) !== cmd.version)
      throw new AppError(
        "Pinned project changed. Refresh before trying again.",
        409,
      );
    const result = await tx.execute(
      sql`INSERT INTO personal_project(email,project_id,pinned) VALUES(${actor.email},${cmd.id},${cmd.pinned ?? false}) ON CONFLICT(email,project_id) DO UPDATE SET pinned=EXCLUDED.pinned,version=personal_project.version+1 RETURNING version,pinned`,
    );
    return result.rows[0];
  });
}
