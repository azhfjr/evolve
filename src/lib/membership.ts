import { and, eq } from "drizzle-orm";
import type { Database } from "./db";
import { member } from "./db/schema";
import type { Actor } from "./types";
import { AppError } from "./permissions";
export async function assertActorActive(
  db: Pick<Database, "select">,
  actor: Actor,
) {
  const admin = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!admin) throw new AppError("Admin workspace belum dikonfigurasi.", 503);
  if (actor.isAdmin) {
    if (actor.email !== admin)
      throw new AppError("Hak administrator tidak valid.", 403);
    return;
  }
  if (
    !(
      await db
        .select({ email: member.email })
        .from(member)
        .where(and(eq(member.email, actor.email), eq(member.disabled, false)))
    )[0]
  )
    throw new AppError("Akses workspace telah dicabut.", 403);
}
