import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "@/lib/db";
import { currentActor } from "@/lib/current-actor";
import { assertActorActive } from "@/lib/membership";
import {
  apiFailure,
  privateJson,
  mutationActor,
  requestJson,
} from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await currentActor(),
      { db } = await database();
    await assertActorActive(db, actor);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("projectId"));
    const rows = await db.execute(
      sql`SELECT id,code,data->>'name' AS name FROM board_asset WHERE project_id=${id} ORDER BY code`,
    );
    return privateJson({ items: rows.rows });
  } catch (e) {
    return apiFailure(e);
  }
}

// Hydrate recovered multi-selections without oversized URLs or exposing private data.
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    const { ids } = z
      .object({ ids: z.array(z.uuid()).max(5000) })
      .strict()
      .parse(await requestJson(request, 250000));
    const { db } = await database();
    await assertActorActive(db, actor);
    if (!ids.length) return privateJson({ items: [] });
    const rows = await db.execute(
      sql`SELECT id,code,data->>'name' AS name FROM board_asset WHERE id IN (${sql.join(
        [...new Set(ids)].map((id) => sql`${id}`),
        sql`,`,
      )}) ORDER BY code`,
    );
    return privateJson({ items: rows.rows });
  } catch (e) {
    return apiFailure(e);
  }
}
