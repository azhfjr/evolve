import { defineConfig } from "@playwright/test";
import base from "./playwright.expansion.config";
export default defineConfig({
  ...base,
  outputDir: "test-results/expansion-cross",
  projects: [
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
});
