import { editorSurface, selectOption } from "./ui-helpers";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
    {
      name: "evolve-locale",
      value: "en",
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);
}
test.afterEach(async ({ page }) => {
  // Keep account fixtures independent if a language assertion fails.
  await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "setLocale", locale: "en" },
  });
});
test("archived tasks remain discoverable through global search and can be restored", async ({
  context,
  page,
}) => {
  await signIn(context);
  const created = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "createTask", task: { title: "Find this archived task" } },
  });
  expect(created.ok()).toBeTruthy();
  const task = (await created.json()).task;
  const archived = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { archived: true },
    },
  });
  expect(archived.ok()).toBeTruthy();
  await page.goto("/app");
  await page.getByRole("button", { name: "Quick find", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search all tasks", exact: true })
    .fill(task.title);
  await expect(
    page.getByRole("option").filter({ hasText: task.title }),
  ).toBeVisible();
  await page.getByRole("option").filter({ hasText: task.title }).click();
  await expect(
    editorSurface(page).getByLabel("Task title", { exact: true }),
  ).toHaveValue(task.title);
  await editorSurface(page)
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await page.request.get(`/api/tasks/${task.id}`);
      return (await r.json()).task.archived;
    })
    .toBe(false);
});

const origin = "http://127.0.0.1:3100";
async function command(page: import("@playwright/test").Page, data: unknown) {
  const response = await page.request.post("/api/workspace", {
    headers: { origin },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
test("archive offers a visible restore action, keeps content after reload, and supports undo", async ({
  context,
  page,
}) => {
  await signIn(context);
  const { project } = await command(page, {
    action: "createProject",
    name: "Archive context project",
    labels: ["Original label"],
  });
  const { task } = await command(page, {
    action: "createTask",
    task: {
      title: "Archive lifecycle with retained context",
      description: "Keep this description",
      projectId: project.id,
    },
  });
  await page.goto(`/app?task=${task.id}`);
  await editorSurface(page)
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await page.getByRole("button", { name: "View archive", exact: true }).click();
  await expect(page.locator("main h1")).toContainText("Archive");
  await expect(page.getByRole("tablist", { name: "Task view" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Import CSV", exact: true }),
  ).toHaveCount(0);
  // Archived tasks continue to inherit the owning project's current labels.
  await command(page, {
    action: "updateConnectionLabels",
    kind: "project",
    id: project.id,
    version: project.version,
    labels: ["Current project label"],
  });
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill(task.title);
  await page
    .getByRole("button", { name: `Restore ${task.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: task.title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: task.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: task.title, exact: true }).click();
  await expect(
    editorSurface(page).getByLabel("Description", { exact: true }),
  ).toHaveValue("Keep this description");
  await expect(
    editorSurface(page).locator(
      ".inherited-project-labels .connection-label-chips span",
    ),
  ).toHaveText(["#current_project_label"]);
  await expect(
    editorSurface(page).locator(".inherited-project-labels input"),
  ).toHaveCount(0);
  await editorSurface(page)
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(editorSurface(page)).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task
          .archived,
    )
    .toBe(false);
  const restored = (
    await (await page.request.get(`/api/tasks/${task.id}`)).json()
  ).task;
  expect(restored.archived).toBe(false);
  expect(restored.projectId).toBe(project.id);
  expect(restored.description).toBe("Keep this description");
  expect(restored.labels).toEqual(["current_project_label"]);
});

test("English-only interface ignores legacy locale cookies and keeps user content unchanged", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: "evolve-locale", value: "id", domain: "127.0.0.1", path: "/" },
  ]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeVisible();
  await page.goto("/demo");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = editorSurface(page);
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Keep original content — tanpa terjemahan");
  await dialog.getByLabel("Task title", { exact: true }).press("Escape");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue(
    "Keep original content — tanpa terjemahan",
  );
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
for (const width of [1440, 768, 360])
  test(`English editor has readable fields and accessible recurrence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = editorSurface(page);
    await dialog
      .getByLabel("Task title", { exact: true })
      .fill("Coordinate the next power planning review with clear ownership");
    await selectOption(
      dialog.getByRole("combobox", { name: /Repeat task/ }),
      "monthly",
    );
    await dialog.getByLabel("Due date", { exact: true }).fill("2026-12-01");
    const metrics = await dialog.evaluate((d) => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      titleFont: parseFloat(
        getComputedStyle(d.querySelector("#task-title")!).fontSize,
      ),
      buttonBottom: d.querySelector("[type=submit]")!.getBoundingClientRect()
        .bottom,
    }));
    expect(metrics.overflow).toBe(false);
    expect(metrics.titleFont).toBeGreaterThanOrEqual(20);
    expect(metrics.titleFont).toBeLessThanOrEqual(22);
    expect(metrics.buttonBottom).toBeLessThanOrEqual(900);
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await dialog
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  });
test("English workspace reflows at 320px with every management page reachable", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/demo");
  await expect(page.locator(".topbar")).toBeVisible();
  for (const label of [
    "Overview",
    "Projects",
    "Inbox",
    "My tasks",
    "All tasks",
    "People",
    "Activity",
    "Archive",
    "Settings",
  ]) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(page.locator("main h1")).toHaveText(new RegExp(label));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      label,
    ).toBe(false);
  }
});

test("task queries show loading and retry instead of briefly rendering the wrong task window", async ({
  context,
  page,
}) => {
  await signIn(context);
  let unblock!: () => void;
  const pending = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let requests = 0;
  await page.route("**/api/tasks?**", async (route) => {
    requests++;
    if (requests === 1) {
      await pending;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary task query failure" }),
      });
    } else await route.continue();
  });
  await page.goto("/app?section=tasks");
  await expect(page.locator(".query-status")).toBeVisible();
  await expect(page.locator(".task-row")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A little breathing room", exact: true }),
  ).toHaveCount(0);
  unblock();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary task query failure" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".task-row").first()).toBeVisible();
  await expect(page.locator(".query-status")).toHaveCount(0);
});
