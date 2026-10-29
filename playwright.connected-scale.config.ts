import { defineConfig } from "@playwright/test";
import base from "./playwright.scale.config";
export default defineConfig({
  ...base,
  testMatch: "connected-scale.spec.ts",
  outputDir: "test-results/connected-scale",
  webServer: {
    ...base.webServer,
    command: "npm run build && npx tsx scripts/start-connected-scale.ts",
  },
  reporter: [["list"]],
});
