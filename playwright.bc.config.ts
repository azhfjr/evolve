import { defineConfig } from "@playwright/test";
import base from "./playwright.connected.config";
export default defineConfig({
  ...base,
  testMatch: "bc-refinement.spec.ts",
  outputDir: "test-results/bc-refinement",
});
