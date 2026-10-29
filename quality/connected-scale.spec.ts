import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
test("canonical 1k project / 10k asset / 20k task APIs remain complete and responsive", async ({
  page,
  context,
}) => {
  const auth = JSON.parse(
    await readFile(".data/connected-scale-auth.json", "utf8"),
  );
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth.admin,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const metrics: Record<string, number> = {};
  for (const path of [
    "/api/board-room?search=Scale",
    "/api/board-room?region=ID-KI",
    "/api/board-room/assets?projectScope=" +
      encodeURIComponent(JSON.stringify({ region: "ID-KI" })),
    "/api/board-room?category=Pembangkit&year=2028",
    "/api/board-room/assets?q=Scale&page=1",
    "/api/tasks?limit=100&sort=title",
    "/api/board-room/connections?category=Pembangkit",
    "/api/workspace/search?q=Scale",
    "/api/board-room/project-options?q=Scale",
    "/api/board-room/hub?id=10000000-0000-4000-8000-000000000001",
  ]) {
    for (let i = 0; i < 3; i++)
      expect((await page.request.get(path)).ok()).toBe(true);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const r = await page.request.get(path);
      expect(r.ok()).toBe(true);
      await r.body();
      times.push(performance.now() - start);
    }
    metrics[path] = times.sort((a, b) => a - b)[
      Math.ceil(times.length * 0.95) - 1
    ];
  }
  const regionData = await (
    await page.request.get("/api/board-room?region=ID-KI")
  ).json();
  expect(regionData.summary.total).toBe(1000);
  expect(regionData.analytics.regions.contextTotal).toBe(1000);
  expect(regionData.analytics.regions.matchingTotal).toBe(1000);
  expect(
    regionData.analytics.regions.provinces.find(
      (r: { code: string }) => r.code === "ID-KI",
    ).matchingCount,
  ).toBe(1000);
  const emptyRegion = await (
    await page.request.get("/api/board-room?region=ID-KB")
  ).json();
  expect(emptyRegion.summary.total).toBe(0);
  expect(emptyRegion.analytics.regions.contextTotal).toBe(1000);
  const assets = await (
    await page.request.get("/api/board-room/assets")
  ).json();
  expect(assets.total).toBe(10000);
  expect(assets.items).toHaveLength(50);
  const map = await (
    await page.request.get("/api/board-room/connections")
  ).json();
  expect(map.total).toBe(1000);
  expect(map.projects).toHaveLength(25);
  const assetIds = new Set<string>(),
    projectIds = new Set<string>(),
    taskIds = new Set<string>();
  for (let pageNumber = 1; pageNumber <= 200; pageNumber++) {
    const r = await page.request.get(
      `/api/board-room/assets?page=${pageNumber}`,
    );
    expect(r.ok()).toBe(true);
    const d = await r.json();
    for (const a of d.items) assetIds.add(a.id);
    expect(d.total).toBe(10000);
  }
  for (let pageNumber = 1; pageNumber <= 40; pageNumber++) {
    const r = await page.request.get(
      `/api/board-room/connections?page=${pageNumber}`,
    );
    expect(r.ok()).toBe(true);
    const d = await r.json();
    for (const p of d.projects) projectIds.add(p.id);
    expect(d.total).toBe(1000);
  }
  let cursor = "";
  do {
    const r = await page.request.get(
      `/api/tasks?limit=100&sort=title${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
    );
    expect(r.ok()).toBe(true);
    const d = await r.json();
    for (const t of d.tasks) taskIds.add(t.id);
    cursor = d.nextCursor ?? "";
  } while (cursor);
  expect(assetIds.size).toBe(10000);
  expect(projectIds.size).toBe(1000);
  expect(taskIds.size).toBe(20000);
  await page.goto("/board-room?section=connections");
  await expect(
    page.getByRole("heading", {
      name: "Project–asset connections",
      level: 2,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Scale project 1\b/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Accessible list", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".network-canvas [data-node]").first(),
  ).toBeVisible();
  expect(
    await page.locator(".network-canvas [data-node]").count(),
  ).toBeLessThanOrEqual(250);
  await page.getByRole("button", { name: "Next assets", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Selected record" }),
  ).toContainText("1000 matching assets");
  expect(
    (
      await (
        await page.request.get(
          "/api/board-room/assets?projectId=10000000-0000-4000-8000-000000000001",
        )
      ).json()
    ).total,
  ).toBe(1000);
  await writeFile(
    "test-results/connected-scale-evidence.json",
    JSON.stringify(
      {
        fixture: { projects: 1000, assets: 10000, tasks: 20000 },
        metrics,
        pagination: {
          projects: projectIds.size,
          assets: assetIds.size,
          tasks: taskIds.size,
          renderedNodes: await page
            .locator(".network-canvas [data-node]")
            .count(),
        },
        environment: {
          cpus: cpus().length,
          memoryGB: Math.round(totalmem() / 1024 ** 3),
        },
        apiRequestsPerMeasurement: 20,
      },
      null,
      2,
    ),
  );
  for (const [path, p95] of Object.entries(metrics))
    expect(p95, path).toBeLessThan(1000);
});
