import { defineConfig } from "@playwright/test";
import base from "./playwright.connected.config";
export default defineConfig({
  ...base,
  testMatch: [
    "feature-expansion.spec.ts",
    "expansion-review.spec.ts",
    "approval-abc.spec.ts",
    "ea-approved.spec.ts",
  ],
  outputDir: "test-results/feature-expansion",
  timeout: 60000,
});
