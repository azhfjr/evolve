import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { cpus, totalmem, platform } from "node:os";
const percentile = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
test("5k projects and 10k tasks satisfy query, interaction and export budgets", async ({
  page,
  context,
}) => {
  const auth = JSON.parse(await readFile(".data/scale-auth.json", "utf8"));
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
    "/api/board-room?category=Pembangkit",
    "/api/tasks?limit=50&open=true",
  ]) {
    for (let i = 0; i < 5; i++)
      expect((await page.request.get(path)).ok()).toBe(true);
    const times: number[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        while (next++ < 100) {
          const start = performance.now();
          const r = await page.request.get(path);
          expect(r.ok()).toBe(true);
          await r.body();
          times.push(performance.now() - start);
        }
      }),
    );
    metrics[path] = percentile(times);
  }
  const interactions: number[] = [];
  await page.goto("/board-room");
  await expect(
    page.getByRole("heading", {
      name: "Kalimantan - Power System Projects",
      exact: true,
    }),
  ).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const search = String(
      i % 2 ? "Scale power project 25" : "Scale power project 26",
    );
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/api/board-room?") &&
        new URL(r.url()).searchParams.get("search") === search,
    );
    const start = performance.now();
    await page
      .getByRole("searchbox", { name: "Search projects", exact: true })
      .fill(search);
    expect((await response).ok()).toBe(true);
    await expect(
      page.getByRole("searchbox", { name: "Search projects", exact: true }),
    ).toHaveValue(search);
    await expect(
      page.locator(".br-project-name b").filter({ hasText: search }).first(),
    ).toBeVisible();
    interactions.push(performance.now() - start);
  }
  // Measure the real in-dashboard action separately from full page navigation.
  await page.goto("/board-room?section=projects");
  const details: number[] = [];
  for (let i = 0; i < 20; i++) {
    const open = page.locator(".br-project-link").nth(i % 10);
    const start = performance.now();
    await open.click();
    await expect(
      page.getByRole("textbox", { name: "Progress review note", exact: true }),
    ).toBeVisible();
    details.push(performance.now() - start);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
  const cold: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const start = performance.now();
    await page.goto(
      `/board-room/projects/10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    await expect(
      page.getByRole("textbox", { name: "Progress review note", exact: true }),
    ).toBeVisible();
    cold.push(performance.now() - start);
  }
  metrics.coldNavigationP95 = percentile(cold);
  metrics.filterP95 = percentile(interactions);
  metrics.detailP95 = percentile(details);
  const lockerFilters: number[] = [],
    lockerDetails: number[] = [];
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "All tasks", exact: true })
    .click();
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.locator(".task-name").first()).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const search = i % 2 ? "Scale task 25" : "Scale task 26";
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/tasks" &&
        new URL(r.url()).searchParams.get("q") === search,
    );
    const start = performance.now();
    await page
      .getByRole("textbox", { name: "Search tasks", exact: true })
      .fill(search);
    expect((await response).ok()).toBe(true);
    await expect(
      page.locator(".task-name").filter({ hasText: search }).first(),
    ).toBeVisible();
    lockerFilters.push(performance.now() - start);
  }
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await page
      .locator(".task-name")
      .nth(i % 10)
      .click();
    const editor = page
      .getByRole("region", { name: "Task editor", exact: true })
      .or(page.getByRole("dialog"));
    await expect(
      editor.getByRole("textbox", { name: "Task title", exact: true }),
    ).toBeVisible();
    lockerDetails.push(performance.now() - start);
    await editor
      .getByRole("button", { name: "Back to workspace", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
  }
  metrics.lockerFilterP95 = percentile(lockerFilters);
  metrics.lockerDetailP95 = percentile(lockerDetails);
  const exported = await page.request.get("/api/board-room?export=csv");
  expect(exported.ok()).toBe(true);
  expect((await exported.body()).byteLength).toBeGreaterThan(4.5 * 1024 * 1024);
  const report = {
    scope: "isolated local production build",
    dataset: {
      boardProjects: 5000,
      lockerTasks: 10000,
      lockerProjects: 500,
      privateFiles: 1000,
    },
    hardware: {
      platform: platform(),
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
    },
    samplesPerAPI: 100,
    readConcurrency: 5,
    metrics,
    productionChanged: false,
  };
  await writeFile(".data/scale-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  expect(metrics["/api/board-room?category=Pembangkit"]).toBeLessThanOrEqual(
    750,
  );
  expect(metrics["/api/tasks?limit=50&open=true"]).toBeLessThanOrEqual(750);
  expect(metrics.filterP95).toBeLessThanOrEqual(1000);
  expect(metrics.detailP95).toBeLessThanOrEqual(1000);
  expect(metrics.lockerFilterP95).toBeLessThanOrEqual(1000);
  expect(metrics.lockerDetailP95).toBeLessThanOrEqual(1000);
});
