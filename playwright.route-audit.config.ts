import { defineConfig } from "@playwright/test";
import base from "./playwright.regional.config";
/** Independent read-only route inspections can share the disposable fixture. */
export default defineConfig({
  ...base,
  testMatch: "balanced-audit.spec.ts",
  grep: /principal routes/,
  workers: 3,
  fullyParallel: true,
  outputDir: "test-results/route-audit",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
});
