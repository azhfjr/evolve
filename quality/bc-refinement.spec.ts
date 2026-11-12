import { test, expect } from "@playwright/test";
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
    },
  ]);
});
test("shared Files uses app hierarchy and no unrelated project action", async ({
  page,
}) => {
  await page.goto("/workspace/settings?tab=files");
  await expect(
    page.getByRole("heading", { name: "Shared settings", exact: true }),
  ).toHaveCSS("font-size", "24px");
  await expect(
    page.getByRole("link", { name: "Project Fields", exact: true }),
  ).toHaveCount(0);
});
test("stage and year strips have navigation and complete alternatives", async ({
  page,
}) => {
  await page.goto("/board-room");
  await expect(
    page.getByRole("button", { name: "Next stages", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next years", exact: true }),
  ).toBeVisible();
  await page.getByText("All stage counts", { exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Complete stage counts" }),
  ).toBeVisible();
});
test("quality tabs survive URL reload", async ({ page }) => {
  await page.goto("/board-room?section=quality");
  await page
    .getByRole("link", { name: "Project attention", exact: true })
    .click();
  await expect(page).toHaveURL(/qualityTab=attention/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Project attention", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Document reviews", exact: true })
    .click();
  await expect(
    page.getByText(
      "Uploading files never automatically makes a project valid.",
    ),
  ).toBeVisible();
});
test("connected demo never calls private mutation endpoints", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && new URL(r.url()).pathname.startsWith("/api/"))
      mutations.push(r.url());
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Explore the connected workspace" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open sample project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create follow-up task", exact: true })
    .click();
  await expect(
    page.getByText("Review sample project evidence", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Locker Room", exact: true }).click();
  await expect(
    page.getByText("Review sample project evidence", { exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});
test("changed pages reflow at six widths with both themes, large fonts and reduced motion", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440, 1920])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of [
        "/workspace/settings?tab=files",
        "/board-room",
        "/demo",
      ]) {
        await page.goto(route);
        await page.locator("h1").first().waitFor();
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          document
            .querySelectorAll(".super-app,.app-shell,.br,.connected-demo")
            .forEach((e) => e.setAttribute("data-font-scale", "large"));
        }, theme);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} ${width} ${theme}`,
        ).toBe(true);
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `test-results/bc-${route.startsWith("/demo") ? "demo" : route.startsWith("/board") ? "board" : "files"}-${width}-${theme}.png`,
          });
      }
    }
});
test("attention shortcuts preserve filters and member workbench is read-only", async ({
  page,
  context,
}) => {
  await page.goto("/board-room?category=Pembangkit");
  await page
    .getByRole("button", { name: "Progress reviews due", exact: true })
    .click();
  await expect(page).toHaveURL(/qualityScope=/);
  const scoped = new URL(page.url()).searchParams.get("qualityScope");
  expect(JSON.parse(scoped!).category).toBe("Pembangkit");
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  await page.goto(
    `/board-room/projects/${fixture.projectId}?projectTab=documents`,
  );
  await expect(
    page.getByRole("region", { name: "Evidence review summary" }),
  ).toContainText("No recorded review baseline");
  const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.clearCookies();
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: tokens["e2e-member"],
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/board-room?section=quality&qualityTab=attention");
  await expect(
    page.getByRole("heading", { name: "Project attention", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/board-room/attention?tab=attention")
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.get("/api/board-room/attention?page=-1")).status(),
  ).toBe(400);
  await expect(
    page.getByRole("button", { name: "Mark finding resolved" }),
  ).toHaveCount(0);
});
test("review regression: removing an attention reason retains portfolio scope", async ({
  page,
}) => {
  const scope = JSON.stringify({ category: "Pembangkit" });
  await page.goto(
    "/board-room?section=quality&qualityTab=attention&qualityAttention=stale&qualityScope=" +
      encodeURIComponent(scope),
  );
  await page.getByRole("link", { name: "Show all attention reasons" }).click();
  await expect(page).not.toHaveURL(/qualityAttention=/);
  expect(new URL(page.url()).searchParams.get("qualityScope")).toBe(scope);
});
test("review regression: complete stage table includes not started", async ({
  page,
}) => {
  await page.goto("/board-room");
  await page.getByText("All stage counts", { exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Complete stage counts" }).getByRole("row"),
  ).toHaveCount(12);
});
test("review regression: connected demo responds to the shared large-font token", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .locator(".connected-demo")
    .evaluate((el) => el.setAttribute("data-font-scale", "large"));
  await expect(
    page.getByRole("heading", { name: "Explore the connected workspace" }),
  ).toHaveCSS("font-size", "28px");
  await expect(page.locator(".connected-demo")).toHaveCSS("font-size", "16px");
});
test("archive uses shared typography and saved appearance attributes", async ({
  page,
}) => {
  await page.goto("/workspace/archive");
  await expect(page.locator(".super-app")).toHaveAttribute(
    "data-font-scale",
    /standard|large/,
  );
  await page
    .locator(".super-app")
    .evaluate((el) => el.setAttribute("data-font-scale", "standard"));
  await expect(
    page.getByRole("heading", { name: "Legacy Locker archive" }),
  ).toHaveCSS("font-size", "24px");
  await page
    .locator(".super-app")
    .evaluate((el) => el.setAttribute("data-font-scale", "large"));
  await expect(
    page.getByRole("heading", { name: "Legacy Locker archive" }),
  ).toHaveCSS("font-size", "28px");
});

test("connected demo selected controls meet contrast requirements in both themes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/demo");
  await page
    .getByRole("heading", { name: "Explore the connected workspace" })
    .waitFor();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const result = await new AxeBuilder({ page })
        .include(".connected-demo")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(
        result.violations.filter(
          (item) => item.impact === "serious" || item.impact === "critical",
        ),
        `${width} ${theme}`,
      ).toEqual([]);
    }
  }
});
