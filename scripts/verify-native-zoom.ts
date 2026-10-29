type BrowserChrome = {
  tabs: {
    query: (query: object) => Promise<{ id: number; url?: string }[]>;
    setZoom: (id: number, zoom: number) => Promise<void>;
    getZoom: (id: number) => Promise<number>;
  };
};
import { chromium, expect } from "@playwright/test";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function main() {
  const dir = await mkdtemp(join(tmpdir(), "evolve-native-zoom-")),
    ext = join(dir, "extension");
  await mkdir(ext);
  await writeFile(
    join(ext, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Local Evolve zoom verification",
      version: "1.0",
      permissions: ["tabs"],
      background: { service_worker: "background.js" },
    }),
  );
  await writeFile(
    join(ext, "background.js"),
    "chrome.runtime.onInstalled.addListener(()=>{});",
  );
  const context = await chromium.launchPersistentContext(join(dir, "profile"), {
    channel: "chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-extensions-except=" + ext,
      "--load-extension=" + ext,
    ],
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: tokens["e2e-admin"],
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const page = await context.newPage();
    const checks = [];
    const projectId = process.env.EVOLVE_ZOOM_PROJECT_ID;
    const routes = projectId
      ? [
          `/board-room/projects/${projectId}?projectTab=storyline`,
          `/app?section=project&project=${projectId}&projectTab=storyline`,
        ]
      : ["/board-room", "/app"];
    for (const route of routes) {
      await page.goto("http://127.0.0.1:3100" + route);
      await page
        .locator(route.startsWith("/app") ? "#main-content" : ".br-content")
        .waitFor();
      await page.locator(".room-loading").waitFor({ state: "hidden" });
      if (projectId)
        await page
          .getByRole("heading", { name: "Project Storyline", exact: true })
          .waitFor();
      const zoom = await worker.evaluate(async () => {
        const chrome = (globalThis as unknown as { chrome: BrowserChrome })
          .chrome;
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) =>
          t.url?.startsWith("http://127.0.0.1:3100"),
        );
        if (!tab) throw Error("Local verification tab unavailable");
        await chrome.tabs.setZoom(tab.id, 2);
        return chrome.tabs.getZoom(tab.id);
      });
      expect(zoom).toBe(2);
      await page.waitForTimeout(250);
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        ratio: devicePixelRatio,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(720);
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      await page.screenshot({
        path: `test-results/balanced-native-zoom-${route.startsWith("/app") ? "locker" : "board"}.png`,
        fullPage: false,
      });
      checks.push({ route, zoom, ...dimensions });
    }
    await writeFile(
      "test-results/balanced-native-zoom.json",
      JSON.stringify({ checks, success: true }, null, 2),
    );
    console.log(JSON.stringify({ nativeZoom: 2, checks, success: true }));
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error("Native zoom verification failed:", e.message);
  process.exitCode = 1;
});
