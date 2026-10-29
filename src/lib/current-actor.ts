import { headers } from "next/headers";
import { getAuth } from "./auth";
import { database } from "./db";
import { member } from "./db/schema";
import { resolveActor } from "./permissions";
import { eq } from "drizzle-orm";
export async function currentActor() {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return resolveActor(null, [], process.env.ADMIN_EMAIL);
  const { db } = await database();
  return resolveActor(
    session?.user ?? null,
    await db
      .select({
        email: member.email,
        name: member.name,
        color: member.color,
        disabled: member.disabled,
        avatarId: member.avatarId,
      })
      .from(member)
      .where(eq(member.email, session.user.email.toLowerCase())),
    process.env.ADMIN_EMAIL,
  );
}
