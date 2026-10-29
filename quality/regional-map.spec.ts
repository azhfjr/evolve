import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ context }) => {
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
});
test("real regional polygons reconcile and keyboard filter retains comparison totals", async ({
  page,
}, testInfo) => {
  const namespace = testInfo.project.name || "chromium";
  const projectName = `Regional QA ${namespace}`;
  const external: string[] = [];
  page.on("request", (r) => {
    if (/geoboundaries|openstreetmap|tiles\./i.test(r.url()))
      external.push(r.url());
  });
  const response = await page.request.post("/api/board-room", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: {
        externalId: `REGIONAL-QA-${namespace}`,
        name: projectName,
        category: "Pembangkit",
        location: "West Kalimantan",
        capacity: 25,
        unit: "MW",
        codYear: 2028,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/board-room?search=" + encodeURIComponent(projectName));
  const map = page.getByRole("region", {
    name: "Kalimantan regional distribution",
    exact: true,
  });
  await expect(map.locator("svg path")).toHaveCount(5);
  const west = map.getByRole("button", { name: /Kalimantan Barat/ });
  await expect(west).toContainText("1");
  await map.screenshot({ path: "test-results/regional-populated-map.png" });
  await west.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/region=ID-KB/);
  const d = await (
    await page.request.get(
      "/api/board-room?search=" +
        encodeURIComponent(projectName) +
        "&region=ID-KB",
    )
  ).json();
  expect(d.summary.total).toBe(1);
  expect(d.analytics.regions.contextTotal).toBe(1);
  expect(
    d.analytics.regions.provinces.reduce(
      (n: number, p: { matchingCount: number }) => n + p.matchingCount,
      0,
    ) +
      d.analytics.regions.missing.matchingCount +
      d.analytics.regions.unrecognized.matchingCount,
  ).toBe(d.summary.total);
  await expect(west).toHaveAttribute("aria-pressed", "true");
  await map.getByText("View regional data", { exact: true }).click();
  await expect(map.getByRole("table")).toContainText("Matching projects");
  const csv = await page.request.get(
    "/api/board-room?search=" +
      encodeURIComponent(projectName) +
      "&region=ID-KB&export=csv",
  );
  expect(csv.ok()).toBeTruthy();
  expect(await csv.text()).toContain(projectName);
  await page.reload();
  await expect(west).toHaveAttribute("aria-pressed", "true");
  await map.getByRole("button", { name: "Clear region", exact: true }).click();
  await expect(page).not.toHaveURL(/region=/);
  await map.getByRole("button", { name: /Kalimantan Utara/ }).click();
  await expect(map.locator(".regional-result")).toContainText(
    "0 matching projects · 1 before location filters",
  );
  await expect(west).toContainText("1");
  expect(external).toEqual([]);
});
test("regional geometry remains available for zero results and narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/board-room?search=no-regional-record-ever");
  const map = page.getByRole("region", {
    name: "Kalimantan regional distribution",
    exact: true,
  });
  await expect(map.locator("svg path")).toHaveCount(5);
  await expect(map).toContainText("No projects match these filters");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await map.getByText("Boundary source and licence", { exact: true }).click();
  await expect(
    map.getByRole("link", { name: "Open Database License 1.0" }),
  ).toBeVisible();
  expect(
    (await page.request.get("/api/board-room?region=ID-INVALID")).status(),
  ).toBe(400);
});
