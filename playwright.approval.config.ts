import { defineConfig } from "@playwright/test";
import base from "./playwright.connected.config";
export default defineConfig({
  ...base,
  testMatch: "approval-abc.spec.ts",
  outputDir: "test-results/approval-abc",
});
