import { defineConfig } from "@playwright/test";
import base from "./playwright.balanced.config";
export default defineConfig({
  ...base,
  testMatch: [
    "regional-map.spec.ts",
    "regional-review.spec.ts",
    "balanced-audit.spec.ts",
    "balanced-review.spec.ts",
  ],
  outputDir: "test-results/regional",
});
