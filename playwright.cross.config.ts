import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./quality",
  testMatch: "critical.spec.ts",
  outputDir: "test-results/cross-browser",
  projects: [
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report/cross-browser" },
    ],
  ],
});
