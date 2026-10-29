import { test, expect, type Request } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
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
test("populated chart segments, unit changes and drill-down reconcile with APIs", async ({
  page,
}) => {
  const ids = [];
  for (const [i, category] of [
    "Pembangkit",
    "Transmisi",
    "Gardu Induk",
  ].entries()) {
    const r = await page.request.post("/api/board-room", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        action: "saveProject",
        values: {
          externalId: `BAL-${Date.now()}-${i}`,
          name: `Balanced audit ${category}`,
          category,
          capacity: i === 0 ? 0 : 25,
          unit: i === 1 ? "MVA" : "MW",
          codYear: 2028 + i,
          location: "Audit region " + i,
        },
      },
    });
    expect(r.ok()).toBe(true);
    ids.push((await r.json()).project.id);
  }
  const asset = await page.request.post("/api/board-room/assets", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "save",
      values: {
        code: "BAL-ASSET-" + Date.now(),
        name: "Balanced audit asset",
        category: "Pembangkit",
        capacity: 12,
        unit: "MW",
        projectId: ids[0],
      },
    },
  });
  expect(asset.ok()).toBe(true);
  await page.goto("/board-room");
  const category = page.getByRole("region", {
    name: "Projects by category",
    exact: true,
  });
  await expect(category.locator("svg [role=button]")).toHaveCount(3);
  await category
    .getByRole("button", { name: "Transmisi", exact: true })
    .click();
  await expect(page).toHaveURL(/category=Transmisi/);
  const data = await (
    await page.request.get("/api/board-room?category=Transmisi")
  ).json();
  expect(data.summary.total).toBeGreaterThan(0);
  await expect(
    page.locator(".dashboard-summary > button").first().locator("strong"),
  ).toHaveText(String(data.summary.total));
  const capacity = page.getByRole("region", {
    name: "Capacity by planned COD",
    exact: true,
  });
  await expect(
    capacity.getByRole("combobox", { name: "Capacity unit" }),
  ).toContainText("MVA");
  await capacity.locator("svg [role=button]").first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/year=2029/);
  await page.goto("/board-room");
  const readiness = page.getByRole("region", {
    name: "Document readiness",
    exact: true,
  });
  const evidence = readiness.locator("svg [role=button]").first();
  await evidence.focus();
  await expect(readiness.getByRole("status")).toContainText("No files");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/validation=none/);
  const current = await (await page.request.get("/api/board-room")).json();
  const stages = [...current.config.stages];
  stages[0] = "Planning approval";
  expect(
    (
      await page.request.post("/api/board-room", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { action: "stages", version: current.config.version, stages },
      })
    ).ok(),
  ).toBe(true);
  const detail = await (
    await page.request.get("/api/board-room?id=" + ids[0])
  ).json();
  expect(
    (
      await page.request.post("/api/board-room", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: {
          action: "progress",
          id: ids[0],
          version: detail.project.version,
          stage: 1,
          reason: "Disposable chart audit progression",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/board-room");
  await expect(page.locator(".br-stage-meter > i")).toHaveCount(10);
  const map = page.getByRole("region", {
    name: "Project–asset map",
    exact: true,
  });
  await map.locator(`[data-node="${ids[0]}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(
    map.getByRole("complementary", { name: "Selected record" }),
  ).toContainText("Planning approval");
  await page.goto("/board-room?search=no-matching-balanced-record");
  for (const kind of ["donut", "pie"]) {
    const chart = page.locator(`[data-visualization=${kind}]`);
    await expect(
      chart.getByText("No matching projects", { exact: true }),
    ).toBeVisible();
    await expect(chart.locator("svg [role=button]")).toHaveCount(0);
  }
});
test("principal routes retain readable containers in both themes and font scales", async ({
  page: accessibilityPage,
  context,
}) => {
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  const routes = [
    "/workspace",
    "/app",
    "/app?section=tasks",
    "/app?section=tasks&view=calendar",
    "/app?section=projects",
    "/app?section=connection",
    "/app?section=mytasks",
    "/app?section=inbox",
    "/app?section=team",
    "/app?section=activity",
    "/app?section=templates",
    "/app?section=files",
    "/app?section=settings",
    "/board-room",
    "/board-room?section=projects",
    "/board-room?section=map",
    "/board-room?section=storyline",
    "/board-room?section=costs",
    "/board-room?section=project-template",
    "/board-room?section=assets",
    "/board-room?section=database",
    "/board-room?section=connections",
    "/board-room?section=reports",
    "/board-room?section=documents",
    "/board-room?section=quality",
    "/board-room?section=settings",
    "/board-room?section=people",
    "/board-room?section=activity",
    "/board-room?section=preferences",
    "/board-room?section=templates",
    "/board-room?section=files",
    "/workspace/settings?section=files",
    "/workspace/settings?section=preferences",
    "/workspace/operations",
    "/workspace/archive",
    "/board-room/projects/" + fixture.projectId,
  ];
  // Each route is an independent visual inspection. Navigation/unsaved-work journeys
  // are covered separately; a forced document replacement cancels Next prefetches in WebKit.
  for (const width of [390, 1440])
    for (const route of routes) {
      const page = await context.newPage();
      const errors: string[] = [];
      const onError = (e: Error) => errors.push(e.message);
      page.on("pageerror", onError);
      const pending = new Set<Request>();
      let lastActivity = Date.now();
      page.on("request", (r) => {
        if (
          ["fetch", "xhr"].includes(r.resourceType()) &&
          !new URL(r.url()).pathname.startsWith("/api/events")
        ) {
          pending.add(r);
          lastActivity = Date.now();
        }
      });
      const complete = (r: Request) => {
        if (pending.delete(r)) lastActivity = Date.now();
      };
      page.on("requestfinished", complete);
      page.on("requestfailed", complete);
      const settled = () =>
        expect
          .poll(() => pending.size === 0 && Date.now() - lastActivity >= 350, {
            timeout: 15000,
          })
          .toBe(true);
      try {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(route);
        await expect(
          page.locator("main:not(.room-loading)").first(),
        ).toBeVisible();
        await page.locator(".room-loading").waitFor({ state: "hidden" });
        await settled();
        await expect(page.locator("body")).not.toContainText(
          "Application error",
        );
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            ({ theme }) => {
              document.documentElement.dataset.theme = theme;
              document
                .querySelectorAll(".br,.app-shell")
                .forEach((el) => el.setAttribute("data-font-scale", "large"));
            },
            { theme },
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${route} ${width} ${theme}`,
          ).toBe(true);
        }
        await settled();
        expect(errors, `${route}: application page errors`).toEqual([]);
      } finally {
        // Check errors before ending the inspection; page-close transport cancellation is teardown.
        page.off("pageerror", onError);
        await page.close();
      }
    }
  await accessibilityPage.goto("/board-room");
  const a11y = await new AxeBuilder({ page: accessibilityPage })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a11y.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
});
test("balanced core layouts cover six widths, both themes, font scales and reduced motion", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const sidebarWidths = [];
    for (const route of ["/app", "/board-room"]) {
      await page.goto(route);
      await expect(
        page.locator("main:not(.room-loading)").first(),
      ).toBeVisible();
      await page.locator(".room-loading").waitFor({ state: "hidden" });
      for (const theme of ["light", "dark"])
        for (const scale of ["normal", "large"]) {
          await page.evaluate(
            ({ theme, scale }) => {
              document.documentElement.dataset.theme = theme;
              document
                .querySelectorAll(".br,.app-shell")
                .forEach((el) => el.setAttribute("data-font-scale", scale));
            },
            { theme, scale },
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${route} ${width} ${theme} ${scale}`,
          ).toBe(true);
          await expect(
            page
              .locator(route === "/app" ? ".page-header h1" : ".br h1")
              .first(),
          ).toHaveCSS("font-size", scale === "large" ? "28px" : "24px");
          await page.screenshot({
            path: `test-results/balanced-${testInfo.project.name || "chromium"}-${route === "/app" ? "locker" : "board"}-${width}-${theme}-${scale}.png`,
            fullPage: true,
          });
        }
      if (width >= 1440)
        sidebarWidths.push(
          (await page
            .locator(route === "/app" ? ".sidebar" : ".br-desktop-sidebar")
            .boundingBox())!.width,
        );
    }
    if (sidebarWidths.length === 2)
      expect(sidebarWidths[0]).toBe(sidebarWidths[1]);
  }
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
});
