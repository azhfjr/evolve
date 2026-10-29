import "server-only";
import { eq } from "drizzle-orm";
import { authConfigured } from "./auth";
import { currentActor } from "./current-actor";
import { database } from "./db";
import { member } from "./db/schema";
import { isThemePreference, type ThemePreference } from "./theme";

// Never cache across requests: this preference belongs to the verified session.
export async function serverTheme(): Promise<ThemePreference | null> {
  if (!authConfigured()) return null;
  try {
    const actor = await currentActor();
    const { db } = await database();
    const [own] = await db
      .select({ preferences: member.preferences })
      .from(member)
      .where(eq(member.email, actor.email));
    const preference = own?.preferences.theme;
    return isThemePreference(preference) ? preference : "system";
  } catch {
    // Login and unavailable/denied sessions must still render without profile data.
    return null;
  }
}
