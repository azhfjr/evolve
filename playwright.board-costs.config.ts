import { defineConfig } from "@playwright/test";
import base from "./playwright.connected.config";
export default defineConfig({
  ...base,
  testMatch: "board-costs.spec.ts",
  outputDir: "test-results/board-costs",
  timeout: 45000,
});
