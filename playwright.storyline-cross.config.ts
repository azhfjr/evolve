import { defineConfig } from "@playwright/test";
import base from "./playwright.storyline.config";
export default defineConfig({
  ...base,
  outputDir: "test-results/storyline-cross",
  projects: [
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
});
