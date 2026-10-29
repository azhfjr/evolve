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
test("dashboard responsive labels and medium map", async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/board-room");
    await expect(
      page.getByRole("region", { name: "Portfolio summary", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const canvas = page.locator(".network-canvas");
    await expect(canvas).toBeVisible();
    expect(Math.round((await canvas.boundingBox())!.height)).toBe(
      width <= 800 ? 280 : 360,
    );
    const filters = page.locator(".br-filters .app-select");
    for (let i = 0; i < (await filters.count()); i++)
      expect((await filters.nth(i).boundingBox())!.width).toBeGreaterThan(100);
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
  }
});
test("overview project popup excludes task previews but dedicated project retains them", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  await page.goto("/board-room?project=" + fixture.projectId);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add project task", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Tasks", exact: true }),
  ).toHaveCount(0);
  await page.goto("/board-room/projects/" + fixture.projectId);
  await expect(
    page.getByRole("button", { name: "Add project task", exact: true }),
  ).toBeVisible();
});
test("map keyboard selection and accessible list", async ({ page }) => {
  await page.goto("/board-room");
  const map = page.getByRole("region", {
    name: "Project–asset map",
    exact: true,
  });
  const project = map.locator("svg [role=button]").first();
  await expect(project).toBeVisible();
  await project.focus();
  await page.keyboard.press("Enter");
  await expect(
    map.getByRole("complementary", { name: "Selected record" }),
  ).toBeVisible();
  await expect(
    map.getByRole("link", { name: "View documents", exact: true }),
  ).toBeVisible();
  await map
    .getByRole("button", { name: "Accessible list", exact: true })
    .click();
  await expect(map.locator(".network-list")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    map.getByRole("complementary", { name: "Selected record" }),
  ).toHaveCount(0);
});
test("expanded asset selection remains visible outside initial graph batch", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  const asset = {
    id: "10000000-0000-4000-8000-000000000099",
    projectId: fixture.projectId,
    code: "MAP-DETAIL",
    name: "Expanded asset",
    category: "Pembangkit",
    capacity: 10,
    unit: "MW",
    location: "Kalimantan",
    voltage: "150 kV",
  };
  await page.route("**/api/board-room/connections?**", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.assets = [];
    data.projects[0].assetCount = 1;
    data.assetTotal = 1;
    await route.fulfill({ response, json: data });
  });
  await page.route("**/api/board-room/assets?**", (route) =>
    route.fulfill({
      json: { items: [asset], total: 1, page: 1, pageSize: 100 },
    }),
  );
  await page.goto("/board-room");
  const map = page.getByRole("region", {
    name: "Project–asset map",
    exact: true,
  });
  await map.locator("svg [role=button]").first().focus();
  await page.keyboard.press("Enter");
  const node = map.getByRole("button", {
    name: /Asset MAP-DETAIL Expanded asset/,
  });
  await expect(node).toBeVisible();
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(
    map.getByRole("heading", { name: "Expanded asset", exact: true }),
  ).toBeVisible();
  await expect(
    map.getByRole("link", { name: "Open asset", exact: true }),
  ).toBeVisible();
});
test("switching assets never displays previous technical details", async ({
  page,
}) => {
  const pid = "10000000-0000-4000-8000-000000000001";
  const assets = [
    {
      id: "10000000-0000-4000-8000-000000000002",
      projectId: pid,
      code: "FIRST",
      name: "First asset",
      category: "Pembangkit",
      capacity: 10,
      unit: "MW",
      location: "FIRST LOCATION",
      voltage: "150 kV",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      projectId: pid,
      code: "SECOND",
      name: "Second asset",
      category: "Pembangkit",
    },
  ];
  await page.route("**/api/board-room/connections?**", (route) =>
    route.fulfill({
      json: {
        projects: [
          {
            id: pid,
            name: "Map project",
            category: "Pembangkit",
            assetCount: 2,
          },
        ],
        assets,
        total: 1,
        assetTotal: 2,
        unassigned: 0,
        page: 1,
      },
    }),
  );
  await page.route("**/api/board-room/assets?**", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("id");
    if (id === assets[1].id) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 503,
        json: { error: "Second record unavailable" },
      });
    } else
      await route.fulfill({
        json: { items: assets.filter((a) => !id || a.id === id), total: 2 },
      });
  });
  await page.goto("/board-room");
  const map = page.getByRole("region", {
    name: "Project–asset map",
    exact: true,
  });
  await map.getByRole("button", { name: /Asset FIRST First asset/ }).focus();
  await page.keyboard.press("Enter");
  await expect(map.getByText("FIRST LOCATION", { exact: true })).toBeVisible();
  await map.getByRole("button", { name: /Asset SECOND Second asset/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    map.getByRole("heading", { name: "Second asset", exact: true }),
  ).toBeVisible();
  await expect(map.getByText("FIRST LOCATION", { exact: true })).toHaveCount(0);
  await expect(map.getByRole("alert")).toContainText(
    "Second record unavailable",
  );
  await expect(map.getByText("FIRST LOCATION", { exact: true })).toHaveCount(0);
});
test("summary follows timeline and charts use varied visualizations", async ({
  page,
}) => {
  await page.goto("/board-room");
  const timeline = page.getByRole("heading", {
    name: "Portfolio timeline",
    exact: true,
  });
  const summary = page.getByRole("region", {
    name: "Portfolio summary",
    exact: true,
  });
  expect((await summary.boundingBox())!.y).toBeGreaterThan(
    (await timeline.boundingBox())!.y,
  );
  for (const kind of ["stacked-columns", "donut", "pie", "columns"])
    await expect(page.locator(`[data-visualization="${kind}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  expect((await summary.boundingBox())!.y).toBeGreaterThan(
    (await page.locator(".dashboard-timeline").boundingBox())!.y,
  );
});
test("balanced shared typography uses matching title and panel roles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["/app", "/board-room"]) {
    await page.goto(route);
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        title: s.getPropertyValue("--text-page-title").trim(),
        panel: s.getPropertyValue("--text-panel-title").trim(),
      };
    });
    expect(tokens.title).toBe("1.5rem");
    expect(tokens.panel).toBe("1rem");
    const heading = page
      .locator(route === "/app" ? ".page-header h1" : ".br h1")
      .first();
    await expect(heading).toHaveCSS("font-size", "24px");
  }
});
