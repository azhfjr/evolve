import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { currentActor } from "@/lib/current-actor";
import { database } from "@/lib/db";
import { taskTemplate } from "@/lib/db/schema";
import { apiFailure, privateJson } from "@/lib/http";
import { AppError } from "@/lib/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: RouteContext<"/api/templates/[id]">,
) {
  try {
    await currentActor();
    const id = z.uuid().parse((await context.params).id);
    const { db } = await database();
    const [template] = await db
      .select()
      .from(taskTemplate)
      .where(and(eq(taskTemplate.id, id), eq(taskTemplate.archived, false)));
    if (!template) throw new AppError("Template tidak ditemukan.", 404);
    return privateJson({ template });
  } catch (e) {
    return apiFailure(e);
  }
}
