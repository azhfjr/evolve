import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "@/lib/db";
import { currentActor } from "@/lib/current-actor";
import { assertActorActive } from "@/lib/membership";
import { apiFailure, privateJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await currentActor(),
      { db } = await database();
    await assertActorActive(db, actor);
    const q = z
      .object({
        q: z.string().max(200).default(""),
        page: z.coerce.number().int().min(1).default(1),
        id: z.uuid().optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
    const rows = await db.execute(
      sql`SELECT id,data->>'name' AS name,external_id AS code,count(*) OVER()::int AS total FROM board_room_project WHERE ${q.id ? sql`id=${q.id}` : sql`(data->>'name' ILIKE ${term} OR external_id ILIKE ${term})`} ORDER BY lower(data->>'name'),id LIMIT 25 OFFSET ${(q.page - 1) * 25}`,
    );
    return privateJson({
      items: rows.rows,
      total: Number(rows.rows[0]?.total ?? 0),
    });
  } catch (e) {
    return apiFailure(e);
  }
}
