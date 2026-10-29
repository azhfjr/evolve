import { defineConfig } from "@playwright/test";
import base from "./playwright.dashboard.config";
export default defineConfig({
  ...base,
  testMatch: ["balanced-audit.spec.ts", "balanced-review.spec.ts"],
  outputDir: "test-results/balanced",
  timeout: 360000,
});
