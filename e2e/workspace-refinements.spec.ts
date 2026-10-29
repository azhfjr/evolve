import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://127.0.0.1:3100";
async function signIn(context: BrowserContext, role = "e2e-admin") {
  const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth[role],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test("sidebar shows long project names and compact mode retains utilities, focus labels and saved preference", async ({
  page,
  context,
}) => {
  await signIn(context);
  const name = "Regional protection coordination and transmission planning";
  expect(
    (
      await page.request.post("/api/workspace", {
        headers: { origin },
        data: { action: "createProject", name, color: "green" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/app");
  const sidebar = page.locator(".sidebar");
  expect((await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(248);
  const project = sidebar.getByRole("button", {
    name: `Project: ${name}`,
    exact: true,
  });
  const label = project.locator("span").first();
  expect(await label.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await sidebar
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(
    sidebar.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  const inbox = sidebar.getByRole("button", { name: "Inbox", exact: true });
  await inbox.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Inbox");
  await project.focus();
  await expect(page.getByRole("tooltip")).toHaveText(name);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await sidebar.evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await sidebar
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/sidebar-collapsed/);
});
test("Ctrl+F opens and refocuses workspace find while Ctrl+K is retired", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.locator(".sidebar-search kbd")).toHaveText("Ctrl F");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+f");
  const dialog = page.getByRole("dialog", {
    name: "Find your next step",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox", {
    name: "Search all tasks",
    exact: true,
  });
  await input.fill("review");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .focus();
  await page.keyboard.press("Control+f");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("review");
  expect(
    await input.evaluate(
      (e: HTMLInputElement) => e.selectionEnd! - e.selectionStart!,
    ),
  ).toBe(6);
  await input.press("Escape");
  await expect(dialog).toHaveCount(0);
});
test("admin deletes activity singly and in bulk with confirmation and error recovery; members are denied", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  const tasks = [];
  for (const title of [
    "Activity cleanup alpha",
    "Activity cleanup beta",
    "Activity cleanup gamma",
  ]) {
    const r = await page.request.post("/api/workspace", {
      headers: { origin },
      data: { action: "createTask", task: { title } },
    });
    expect(r.ok()).toBeTruthy();
    tasks.push((await r.json()).task);
  }
  const original = await (
    await page.request.get("/api/activity?q=Activity%20cleanup")
  ).json();
  expect(original.activities).toHaveLength(3);
  await page.goto("/app?section=activity");
  await page
    .getByRole("textbox", { name: "Search activity", exact: true })
    .fill("Activity cleanup");
  const rows = page.locator(".activity-row");
  await expect(rows).toHaveCount(3);
  await rows
    .first()
    .getByRole("button", { name: /Delete activity:/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  await rows
    .first()
    .getByRole("button", { name: /Delete activity:/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete activity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("checkbox", {
      name: "Select all loaded activities",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  let failed = false;
  await page.route("**/api/workspace", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "deleteActivities" &&
      !failed
    ) {
      failed = true;
      await route.fulfill({
        status: 503,
        json: { error: "Temporary journal error" },
      });
    } else await route.continue();
  });
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Delete 2 activities", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("Temporary journal error");
  await dialog
    .getByRole("button", { name: "Delete 2 activities", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search activity", exact: true })
    .fill("Activity cleanup");
  await expect(rows).toHaveCount(0);
  expect(
    (
      await (
        await page.request.get("/api/activity?q=Activity%20cleanup")
      ).json()
    ).total,
  ).toBe(0);
  for (const task of tasks)
    expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(
      200,
    );
  const member = await browser.newContext({ baseURL: origin });
  await signIn(member, "e2e-member");
  expect(
    (
      await member.request.post("/api/workspace", {
        headers: { origin },
        data: {
          action: "deleteActivities",
          ids: original.activities.map((a: { id: string }) => a.id),
        },
      })
    ).status(),
  ).toBe(403);
  const memberPage = await member.newPage();
  await memberPage.goto("/app?section=activity");
  await expect(
    memberPage.getByRole("button", { name: "Delete selected", exact: true }),
  ).toHaveCount(0);
  await member.close();
});
for (const width of [1440, 768, 390, 320])
  test(`all Settings menus reflow with consistent controls at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo?section=settings");
    for (const tab of [
      "My account",
      "Appearance",
      "Google Calendar",
      "Workspace",
      "Files",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const panel = page.getByRole("tabpanel", { name: tab, exact: true });
      await expect(panel).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await expect(
        page.getByRole("heading", {
          name: "Workspace appearance",
          exact: true,
        }),
      ).toHaveCount(0);
      const violations = (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations;
      expect(
        violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/refinement-settings-${tab.replaceAll(" ", "-")}-${width}.png`,
        fullPage: true,
      });
    }
  });
