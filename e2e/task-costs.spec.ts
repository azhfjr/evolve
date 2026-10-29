import { historicalProject } from "./historical-project-fixture";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { selectOption } from "./ui-helpers";
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
async function assertA11y(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}
test("task creation stages private files, restores them after reload and recovers a lost creation response without duplicating", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  await signIn(context);
  await page.goto("/app?section=tasks&task=new");
  const editor = page.getByRole("region", { name: "Task editor", exact: true }),
    files = page.getByRole("region", {
      name: "Task draft attachments",
      exact: true,
    });
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Task created with private draft files");
  await selectOption(files.getByLabel("Draft document purpose"), "Reference");
  const chooserPromise = page.waitForEvent("filechooser");
  await editor
    .getByRole("button", { name: "Attachments", exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles([
    {
      name: "Before creation.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Draft-only file"),
    },
    {
      name: "Unsafe.html",
      mimeType: "text/html",
      buffer: Buffer.from("<html>not supported</html>"),
    },
  ]);
  await expect(
    files.getByText("Ready to attach", { exact: false }),
  ).toBeVisible();
  await expect(
    files.getByRole("button", { name: "Retry Unsafe.html", exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Create task", exact: true }),
  ).toBeDisabled();
  await files
    .getByRole("button", { name: "Remove failed Unsafe.html", exact: true })
    .click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await assertA11y(page);
    await page.screenshot({
      path: `test-results/attachments-ready-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const href = await files
    .getByRole("link", { name: "Before creation.txt", exact: true })
    .getAttribute("href");
  const member = await browser.newContext();
  await signIn(member, "e2e-member");
  expect((await member.request.get(origin + href)).status()).toBe(404);
  await page.reload();
  await editor
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    files.getByRole("link", { name: "Before creation.txt", exact: true }),
  ).toBeVisible();
  let lost = false,
    createdId = "";
  await page.route("**/api/workspace", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON().action === "createTask"
    ) {
      const response = await route.fetch();
      const body = await response.json();
      createdId = body.task.id;
      if (!lost) {
        lost = true;
        await route.fulfill({
          status: 503,
          json: { error: "Response interrupted. Retry the same task safely." },
        });
        return;
      }
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await editor
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(
    editor.getByRole("alert").filter({ hasText: "Response interrupted" }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page.goto(`/app?task=${createdId}`);
  const saved = page.getByRole("region", {
    name: "Document attachments",
    exact: true,
  });
  await expect(
    saved.getByText("Before creation.txt", { exact: true }),
  ).toBeVisible();
  expect((await member.request.get(origin + href)).status()).toBe(200);
  const query = await page.request.get(
    "/api/tasks?q=Task%20created%20with%20private%20draft%20files&limit=50",
  );
  expect((await query.json()).total).toBe(1);
  await page.reload();
  await expect(
    saved.getByText("Before creation.txt", { exact: true }),
  ).toBeVisible();
  await member.close();
});
test("a failed attachment can be retried, and in-flight uploads protect creation and navigation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app?section=tasks&task=new");
  const editor = page.getByRole("region", { name: "Task editor", exact: true }),
    files = page.getByRole("region", {
      name: "Task draft attachments",
      exact: true,
    });
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Retried draft upload");
  let attempts = 0,
    release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/attachments/local-upload?**", async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Temporary upload failure" },
      });
    else {
      await gate;
      await route.continue();
    }
  });
  await selectOption(files.getByLabel("Draft document purpose"), "Reference");
  await files.locator("input[type=file]").setInputFiles({
    name: "Retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Retry the same file"),
  });
  await expect(files.getByRole("alert")).toContainText(
    "Temporary upload failure",
  );
  await files
    .getByRole("button", { name: "Retry Retry.txt", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Create task", exact: true }),
  ).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "Save draft & close", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  await expect(editor).toBeVisible();
  release();
  await expect(
    files.getByRole("link", { name: "Retry.txt", exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Create task", exact: true }),
  ).toBeEnabled();
  await editor
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
});
test("historical project costs retain exact currency totals as read-only records", async ({
  page,
  context,
}) => {
  await signIn(context);
  const p = await historicalProject(page, {
    name: "Historical grouped costs",
    costOptions: [
      {
        id: crypto.randomUUID(),
        title: "Historical package",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Engineering",
            unit: "USD",
            amount: "0.10",
          },
          {
            id: crypto.randomUUID(),
            title: "Review",
            unit: "USD",
            amount: "0.20",
          },
          {
            id: crypto.randomUUID(),
            title: "Equipment",
            unit: "IDR",
            amount: "1250000.50",
          },
        ],
      },
    ],
  });
  await page.goto("/app?section=project&project=" + p.id);
  await expect(page.locator(".project-cost-breakdown li")).toHaveCount(3);
  await expect(
    page.locator('.cost-option-totals strong[data-unit="USD"]'),
  ).toHaveText("$0.30");
  await expect(
    page.getByRole("button", { name: "Manage costs", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".project-cost-breakdown li")).toHaveCount(3);
});

for (const width of [1440, 1024, 768, 390, 320])
  test(`Activity, Settings, creation attachments and Cost reflow accessibly at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo?section=activity");
    await assertA11y(page);
    await page.screenshot({
      path: `test-results/activity-cost-${width}.png`,
      fullPage: true,
    });
    await page.goto("/demo?section=settings");
    for (const tab of [
      "My account",
      "Appearance",
      "Google Calendar",
      "Workspace",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await assertA11y(page);
    }
    await page.screenshot({
      path: `test-results/settings-cost-${width}.png`,
      fullPage: true,
    });
    await page.goto("/demo?section=projects");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
    await dialog
      .getByLabel("Project name", { exact: true })
      .fill("Recovered metadata draft");
    await assertA11y(page);
    await page.screenshot({ path: `test-results/cost-items-${width}.png` });
    await dialog
      .getByRole("button", { name: "Save draft & close", exact: true })
      .click();
    await page.goto("/demo?section=tasks&task=new");
    await expect(
      page.getByRole("region", { name: "Task draft attachments", exact: true }),
    ).toBeVisible();
    await assertA11y(page);
  });
