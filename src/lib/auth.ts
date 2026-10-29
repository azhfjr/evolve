import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database } from "./db";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";
let authPromise: ReturnType<typeof createAuth> | undefined;
export function authConfigured() {
  if (
    process.env.VERCEL &&
    (!process.env.BETTER_AUTH_URL?.startsWith("https://") ||
      !process.env.DATABASE_URL ||
      process.env.EVOLVE_LOCAL_DATABASE === "1")
  )
    return false;
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_SECRET.length >= 32 &&
    process.env.BETTER_AUTH_URL &&
    process.env.ADMIN_EMAIL,
  );
}
async function createAuth() {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  if (
    process.env.VERCEL &&
    (!process.env.BETTER_AUTH_URL?.startsWith("https://") ||
      !process.env.DATABASE_URL ||
      process.env.EVOLVE_LOCAL_DATABASE === "1")
  )
    throw new Error(
      "Vercel requires an HTTPS auth origin and managed PostgreSQL",
    );
  const { db } = await database();
  return betterAuth({
    appName: "Evolve",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              prompt: "select_account",
            },
          }
        : {},
    emailAndPassword: { enabled: false },
    account: { encryptOAuthTokens: true },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: { "/sign-in/social": { window: 60, max: 10 } },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (incoming) => {
            const email = incoming.email.toLowerCase();
            const admitted =
              email === process.env.ADMIN_EMAIL?.toLowerCase() ||
              (
                await db
                  .select()
                  .from(schema.member)
                  .where(eq(schema.member.email, email))
              )[0]?.disabled === false;
            if (!admitted || !incoming.emailVerified) return false;
            return { data: { ...incoming, email } };
          },
        },
      },
    },
  });
}
export function getAuth(): ReturnType<typeof createAuth> {
  if (!authPromise)
    authPromise = createAuth().catch((e) => {
      authPromise = undefined;
      throw e;
    });
  return authPromise;
}
