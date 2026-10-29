import { defineConfig } from "@playwright/test";
import base from "./playwright.board-costs.config";
export default defineConfig({
  ...base,
  projects: [
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
  outputDir: "test-results/board-costs-cross",
});
