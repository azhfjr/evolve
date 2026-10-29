import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
const url = new URL(
  process.env.EVOLVE_E2E_DATABASE_URL || process.env.DATABASE_URL || "",
);
if (
  !process.env.EVOLVE_E2E_DATABASE_URL &&
  !["127.0.0.1", "localhost"].includes(url.hostname)
)
  throw new Error(
    "Browser tests require a disposable EVOLVE_E2E_DATABASE_URL.",
  );
url.pathname = "/evolve_e2e";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    storageState: {
      cookies: [
        {
          name: "evolve-locale",
          value: "en",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CI
      ? {}
      : {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
          args: ["--no-sandbox"],
        },
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: url.toString(),
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ||
        "evolve-browser-tests-only-not-a-production-secret",
      ADMIN_EMAIL: "jarjirjor777@gmail.com",
      GOOGLE_CLIENT_ID: "browser-tests-only.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "browser-tests-only-not-real-credentials",
      NEXT_TELEMETRY_DISABLED: "1",
      BLOB_READ_WRITE_TOKEN: "",
      EVOLVE_LOCAL_FILES: "1",
      EVOLVE_FILES_DIR: ".data/e2e-files",
    },
  },
});
