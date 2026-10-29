import { defineConfig } from "@playwright/test";
import base from "./playwright.dashboard.config";
export default defineConfig({
  ...base,
  testMatch: "native-zoom.spec.ts",
  timeout: 90000,
  outputDir: "test-results/native-zoom",
});
