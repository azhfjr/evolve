import { defineConfig } from "@playwright/test";
import connected from "./playwright.connected.config";
export default defineConfig({
  ...connected,
  outputDir: "test-results/connected-cross",
  projects: [
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
  reporter: [["list"]],
});
