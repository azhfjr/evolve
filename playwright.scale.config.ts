import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./quality",
  testMatch: "scale.spec.ts",
  workers: 1,
  timeout: 120000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3101",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CI
      ? {}
      : { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx tsx scripts/start-scale-server.ts",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
