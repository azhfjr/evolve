import { defineConfig } from "@playwright/test";
import base from "./playwright.bc.config";
export default defineConfig({
  ...base,
  outputDir: "test-results/bc-cross",
  projects: [
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
});
