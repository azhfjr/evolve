import { defineConfig } from "@playwright/test";
import base from "./playwright.connected.config";
export default defineConfig({
  ...base,
  globalSetup: "./quality/storyline-setup.ts",
  testMatch: ["project-storyline.spec.ts"],
  outputDir: "test-results/storyline",
  timeout: 60000,
});
