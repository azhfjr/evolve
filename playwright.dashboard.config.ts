import { defineConfig } from "@playwright/test";
import base from "./playwright.connected.config";
export default defineConfig({
  ...base,
  testMatch: ["board-dashboard.spec.ts", "shared-interactions.spec.ts"],
  outputDir: "test-results/dashboard",
});
