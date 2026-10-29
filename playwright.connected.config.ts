import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./quality",
  testMatch: ["connected.spec.ts", "connected-drafts.spec.ts"],
  globalSetup: "./quality/connected-setup.ts",
  outputDir: "test-results/connected",
  reporter: [["list"]],
  timeout: 45000,
});
