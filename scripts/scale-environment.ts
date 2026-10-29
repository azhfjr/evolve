import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
export const SCALE_ADMIN = "scale-admin@example.test";
export const SCALE_MEMBER = "scale-member@example.test";
export const SCALE_SECRET =
  "evolve-scale-fixtures-only-not-a-production-secret-2026";
export const SCALE_ORIGIN = "http://127.0.0.1:3101";
export function scaleDatabaseURL() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Scale fixtures require a PostgreSQL protocol URL.");
  if (url.search || url.hash)
    throw new Error(
      "Scale fixtures require a plain localhost URL without query overrides or a fragment.",
    );
  if (process.env.VERCEL || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error(
      "Scale fixtures require a disposable localhost database, outside Vercel.",
    );
  url.pathname = "/evolve_perf";
  return url;
}

export function scaleServerEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: scaleDatabaseURL().toString(),
    ADMIN_EMAIL: SCALE_ADMIN,
    BETTER_AUTH_URL: SCALE_ORIGIN,
    BETTER_AUTH_SECRET: SCALE_SECRET,
    GOOGLE_CLIENT_ID: "scale-tests-only.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "scale-tests-only-not-real-credentials",
    BLOB_READ_WRITE_TOKEN: "",
    EVOLVE_LOCAL_FILES: "1",
    EVOLVE_FILES_DIR: ".data/scale-files",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
