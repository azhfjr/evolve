import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
test("both apps reflow at recorded native Chromium 200 percent zoom", async () => {
  await promisify(execFile)(
    process.execPath,
    ["--import", "tsx", "scripts/verify-native-zoom.ts"],
    { timeout: 75000 },
  );
  const evidence = JSON.parse(
    await readFile("test-results/balanced-native-zoom.json", "utf8"),
  );
  expect(evidence.success).toBe(true);
  expect(evidence.checks).toHaveLength(2);
  for (const row of evidence.checks) {
    expect(row.zoom).toBe(2);
    expect(row.scroll).toBeLessThanOrEqual(row.width);
    expect(row.width).toBeLessThanOrEqual(720);
  }
});
