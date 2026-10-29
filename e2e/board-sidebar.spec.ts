import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ context }) => {
  const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
test("Board feature menus fill the sidebar, remain reachable and navigate without replacing it", async ({
  page,
}) => {
  await page.goto("/board-room");
  const sidebar = page.locator(".br-sidebar").first(),
    nav = sidebar.getByRole("navigation", { name: "Main navigation" });
  const area = await sidebar.locator(".sidebar-scroll-area").boundingBox(),
    bounds = await nav.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(area!.width - 8);
  await sidebar.evaluate((el) => {
    (window as unknown as { sidebar: Element }).sidebar = el;
  });
  for (const name of [
    "Overview",
    "Projects",
    "Documents",
    "Reports",
    "Database",
    "Stage settings",
  ]) {
    const button = nav.getByRole("button", { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    expect(
      await sidebar.evaluate(
        (el) => el === (window as unknown as { sidebar: Element }).sidebar,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("heading", { name: "Shared project stages", exact: true }),
  ).toBeVisible();
});
test("collapse responds before saving and transitions smoothly like Locker Room", async ({
  page,
}) => {
  await page.goto("/board-room");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/workspace/experience", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Collapse navigation", exact: true })
      .click();
    await expect(page.locator(".br")).toHaveClass(/br-navigation-collapsed/, {
      timeout: 1000,
    });
    const sidebar = page.locator(".br-sidebar").first();
    expect(
      await sidebar.evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toContain("0.18s");
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox())!.width))
      .toBe(76);
  } finally {
    release();
  }
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Collapse navigation", exact: true }),
  ).toBeEnabled();
});
test("a delayed dashboard response cannot undo a saved sidebar preference", async ({
  page,
}) => {
  await page.goto("/board-room");
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    ready = new Promise<void>((r) => (started = r));
  await page.route("**/api/board-room?*", async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Refresh Board Room", exact: true })
    .click();
  await ready;
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toBeEnabled();
  release();
  await expect(
    page.getByRole("button", { name: "Refresh Board Room", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".br")).toHaveClass(/br-navigation-collapsed/);
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Collapse navigation", exact: true }),
  ).toBeEnabled();
});
test("responsive sidebar keeps its desktop tree and drawer menus remain usable", async ({
  page,
}) => {
  await page.goto("/board-room");
  await page.locator(".br-desktop-sidebar").evaluate((el) => {
    (window as unknown as { desktopSidebar: Element }).desktopSidebar = el;
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(page.locator(".br-desktop-sidebar")).toBeHidden();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Board Room navigation",
    exact: true,
  });
  for (const name of [
    "Overview",
    "Projects",
    "Documents",
    "Reports",
    "Database",
    "Stage settings",
  ]) {
    const button = drawer.getByRole("button", { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
  }
  await drawer.getByRole("button", { name: "Database", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Project database", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".br-desktop-sidebar")).toBeVisible();
  await expect(
    page.locator(".br-desktop-sidebar .br-sidebar-toggle"),
  ).toBeFocused();
  expect(
    await page
      .locator(".br-desktop-sidebar")
      .evaluate(
        (el) =>
          el ===
          (window as unknown as { desktopSidebar: Element }).desktopSidebar,
      ),
  ).toBe(true);
});
