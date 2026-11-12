import { defineConfig } from "@playwright/test";
import base from "./playwright.connected-scale.config";
export default defineConfig({
  ...base,
  testMatch: "bc-scale.spec.ts",
  outputDir: "test-results/bc-scale",
  timeout: 240000,
});
