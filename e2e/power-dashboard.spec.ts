import { historicalCosts } from "./historical-project-fixture";
import { editorSurface, selectOption } from "./ui-helpers";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://127.0.0.1:3100";
async function signIn(context: BrowserContext) {
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
}
async function nav(page: Page, name: string) {
  await expect(page.locator(".topbar")).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function command(page: Page, data: unknown) {
  const response = await page.request.post("/api/workspace", {
    headers: { origin },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
test("Dashboard charts, browser history, live clock, and task drafts work together", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  const schedule = page.locator(".overview-schedule");
  await schedule.getByText("View data", { exact: false }).click();
  await expect(schedule.getByRole("table")).toBeVisible();
  await expect(schedule.getByRole("row")).toHaveCount(15);
  await nav(page, "Projects");
  await nav(page, "Activity");
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("Projects");
  await page.goForward();
  await expect(page.locator("main h1")).toHaveText("Activity");
  await nav(page, "All tasks");
  const first = page.locator(".task-name").first();
  const title = await first.innerText();
  await first.click();
  await expect(editorSurface(page)).toBeVisible();
  await page.goBack();
  await expect(editorSurface(page)).toHaveCount(0);
  await page.goForward();
  await expect(
    editorSurface(page).getByLabel("Task title", { exact: true }),
  ).toHaveValue(title.split("\n")[0]);
  await editorSurface(page)
    .getByRole("button", {
      name: /^(Close dialog|Back to workspace)$/,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const input = editorSurface(page).getByLabel("Task title", { exact: true });
  await input.fill("A draft that survives clock updates");
  const clock = page.locator(".live-clock-header time"),
    before = await clock.innerText();
  await expect.poll(() => clock.innerText()).not.toBe(before);
  await expect(input).toHaveValue("A draft that survives clock updates");
});
test("project planning and USD option costs persist through reload without Expense", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = editorSurface(page);
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Power study browser project");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Coordinate the Kalimantan system planning study.");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Start date", { exact: true }).fill("2026-10-01");
  await dialog.getByLabel("Target date", { exact: true }).fill("2026-12-31");
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const snapshot = await (await page.request.get("/api/workspace")).json();
  const legacy = snapshot.projects.find(
    (p: { name: string }) => p.name === "Power study browser project",
  );
  await historicalCosts(legacy.id, {
    name: legacy.name,
    budget: "12500.50",
    currency: "USD",
  });
  await page.reload();
  await page
    .locator(".portfolio-card")
    .filter({ hasText: "Power study browser project" })
    .click();
  await expect(
    page.locator(
      '.cost-option-summary .cost-option-totals strong[data-unit="USD"]',
    ),
  ).toHaveText("$12,500.50");
  await expect(
    page.getByRole("button", { name: "Record expense", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".finance-metrics,.ledger-table")).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(
      '.cost-option-summary .cost-option-totals strong[data-unit="USD"]',
    ),
  ).toHaveText("$12,500.50");
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(
    editorSurface(page).getByLabel("Amount", { exact: true }),
  ).toHaveCount(0);
});

test("saved task views restore filters and layout after reload", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app?section=tasks");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await selectOption(
    page.getByRole("combobox", { name: "Priority", exact: true }),
    "high",
  );
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const dialog = editorSurface(page);
  await dialog
    .getByLabel("Save current view", { exact: true })
    .fill("High priority planning");
  await dialog.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: /^High priority planning/ }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: /^(Close dialog|Back to workspace)$/,
      exact: true,
    })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await editorSurface(page)
    .getByRole("button", { name: /^High priority planning/ })
    .click();
  await expect(page).toHaveURL(/priority=high/);
});
test("per-task Calendar status is private and consent returns to the selected task", async ({
  context,
  page,
  request,
}) => {
  await signIn(context);
  const { task } = await command(page, {
    action: "createTask",
    task: { title: "Calendar selected browser task", dueDate: "2026-12-01" },
  });
  await page.goto(`/app?task=${task.id}`);
  await expect(
    page.getByRole("heading", { name: "Google Calendar", exact: true }),
  ).toBeVisible();
  const status = await page.request.get(`/api/tasks/${task.id}/calendar`);
  expect(status.ok()).toBeTruthy();
  const body = await status.json();
  expect(body.connected).toBe(false);
  expect(body.taskState).toBe("disconnected");
  expect(body).not.toHaveProperty("accessToken");
  expect((await request.get(`/api/tasks/${task.id}/calendar`)).status()).toBe(
    401,
  );
  const consent = await page.request.post("/api/calendar", {
    headers: { origin },
    data: { action: "connect", taskId: task.id },
  });
  expect(consent.ok()).toBeTruthy();
  const url = new URL((await consent.json()).url);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/calendar/callback`,
  );
  const sync = await page.request.post(`/api/tasks/${task.id}/calendar`, {
    headers: { origin },
    data: { enabled: true },
  });
  expect(sync.status()).toBe(409);
});
test("Dashboard exposes API failures and recovers when retried", async ({
  context,
  page,
}) => {
  await signIn(context);
  let fail = true;
  await page.route("**/api/dashboard?**", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Dashboard temporarily unavailable" }),
      });
    else await route.continue();
  });
  await page.goto("/app");
  await expect(page.locator(".dashboard-page [role=alert]")).toContainText(
    "Dashboard temporarily unavailable",
  );
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".dashboard-page [role=alert]")).toHaveCount(0);
  await expect(
    page.locator(".metric-card").first().locator("strong"),
  ).not.toHaveText("—");
});
for (const width of [1440, 320])
  test(`login and Dashboard meet accessibility and reflow checks at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", "/demo"]) {
      await page.goto(path);
      if (path === "/demo")
        await expect(page.locator(".dashboard-page")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }
  });
