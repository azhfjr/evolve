import { editorSurface, selectOption } from "./ui-helpers";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { format } from "date-fns";
import AxeBuilder from "@axe-core/playwright";

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
async function nav(page: Page, label: string) {
  await page.locator(".topbar").waitFor();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  if (label === "Settings") {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    return;
  }
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: label, exact: false })
    .click();
}
async function openCreate(page: Page) {
  await page.getByRole("button", { name: "New task", exact: true }).click();
  return editorSurface(page);
}
async function savedTask(page: Page, title: string) {
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const task = data.tasks.find(
    (task: { title: string }) => task.title === title,
  );
  expect(task).toBeTruthy();
  return task;
}
async function taggedProject(page: Page, name: string, labels: string[]) {
  const response = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "createProject", name, labels },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).project;
}
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/app");
});

test("My tasks supplies the owner and create-another retains useful properties", async ({
  page,
}) => {
  await nav(page, "My tasks");
  const dialog = await openCreate(page);
  await expect(dialog.getByLabel("Assignee", { exact: true })).toHaveAttribute(
    "data-value",
    "jarjirjor777@gmail.com",
  );
  await selectOption(dialog.getByLabel("Priority", { exact: true }), "high");
  await dialog.getByLabel("Create another", { exact: true }).check();
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Composer first task");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue(
    "",
  );
  await expect(dialog.getByLabel("Priority", { exact: true })).toHaveAttribute(
    "data-value",
    "high",
  );
  await expect(dialog.getByLabel("Task title", { exact: true })).toBeFocused();
  await dialog.getByLabel("Create another", { exact: true }).uncheck();
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Composer second task");
  await dialog.getByLabel("Task title", { exact: true }).press("Control+Enter");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Composer second task", exact: true }),
  ).toBeVisible();
  expect((await savedTask(page, "Composer first task")).assignee).toBe(
    "jarjirjor777@gmail.com",
  );
  expect((await savedTask(page, "Composer second task")).priority).toBe("high");
});

test("saving retains pending checklist input and inherited project hashtags", async ({
  page,
}) => {
  const project = await taggedProject(page, "Composer checklist project", [
    "Design",
    "Research",
    "design",
  ]);
  await page.reload();
  const dialog = await openCreate(page);
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("No input left behind");
  await dialog.getByRole("button", { name: "Checklist", exact: true }).click();
  await dialog
    .getByLabel("New checklist item")
    .fill("An unfinished checklist entry");
  await selectOption(dialog.getByLabel("Project", { exact: true }), project.id);
  await expect(
    dialog.locator(".inherited-project-labels .connection-label-chips span"),
  ).toHaveText(["#design", "#research"]);
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const task = await savedTask(page, "No input left behind");
  expect(task.checklist).toHaveLength(1);
  expect(task.checklist[0].text).toBe("An unfinished checklist entry");
  expect(task.projectId).toBe(project.id);
  expect(task.labels).toEqual(["design", "research"]);
});

test("task hashtags are read only and follow the selected project when creating and editing", async ({
  page,
}) => {
  const firstProject = await taggedProject(page, "Composer design ownership", [
    "Design review",
  ]);
  const secondProject = await taggedProject(
    page,
    "Composer research ownership",
    ["Research planning"],
  );
  await page.reload();
  let dialog = await openCreate(page);
  const inherited = dialog.locator(".inherited-project-labels");
  await expect(inherited).toContainText(
    "Select a project to inherit its labels.",
  );
  await expect(
    inherited.locator("input, textarea, button, [contenteditable=true]"),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Labels", exact: true }),
  ).toHaveCount(0);
  await selectOption(
    dialog.getByLabel("Project", { exact: true }),
    firstProject.id,
  );
  await expect(inherited.locator(".connection-label-chips span")).toHaveText([
    "#design_review",
  ]);
  await selectOption(
    dialog.getByLabel("Project", { exact: true }),
    secondProject.id,
  );
  await expect(inherited.locator(".connection-label-chips span")).toHaveText([
    "#research_planning",
  ]);
  await selectOption(dialog.getByLabel("Project", { exact: true }), "");
  await expect(inherited.locator(".connection-label-chips span")).toHaveCount(
    0,
  );
  await expect(inherited).toContainText(
    "Select a project to inherit its labels.",
  );
  await selectOption(
    dialog.getByLabel("Project", { exact: true }),
    secondProject.id,
  );
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("A task with current project hashtags");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const created = await savedTask(page, "A task with current project hashtags");
  expect(created.projectId).toBe(secondProject.id);
  expect(created.labels).toEqual(["research_planning"]);
  await page.goto(`/app?task=${created.id}`);
  dialog = editorSurface(page);
  await expect(
    dialog.locator(".inherited-project-labels .connection-label-chips span"),
  ).toHaveText(["#research_planning"]);
  await selectOption(
    dialog.getByLabel("Project", { exact: true }),
    firstProject.id,
  );
  await expect(
    dialog.locator(".inherited-project-labels .connection-label-chips span"),
  ).toHaveText(["#design_review"]);
  const updateRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/workspace") &&
      request.method() === "POST" &&
      request.postDataJSON().action === "updateTask",
  );
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  expect((await updateRequest).postDataJSON().patch).not.toHaveProperty(
    "labels",
  );
  await expect(dialog).toHaveCount(0);
  const moved = await savedTask(page, created.title);
  expect(moved.projectId).toBe(firstProject.id);
  expect(moved.labels).toEqual(["design_review"]);
  await page.reload();
  const persisted = await (
    await page.request.get(`/api/tasks/${created.id}`)
  ).json();
  expect(persisted.task.labels).toEqual(["design_review"]);
  await page.goto("/app?section=tasks");
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("#DESIGN REVIEW");
  await expect(
    page.locator(".task-row").filter({ hasText: created.title }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(
    page
      .locator(".kanban-card")
      .filter({ hasText: created.title })
      .locator(".task-labels"),
  ).toContainText("#design_review");
});

test("a creation draft survives Escape and reload, then clears after saving", async ({
  page,
}) => {
  let dialog = await openCreate(page);
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("A draft worth keeping");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Important context");
  await selectOption(
    dialog.getByLabel("Project", { exact: true }),
    "20000000-0000-4000-8000-000000000001",
  );
  await dialog.getByLabel("Task title", { exact: true }).press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  dialog = await openCreate(page);
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue(
    "A draft worth keeping",
  );
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    "Important context",
  );
  await expect(dialog.getByLabel("Project", { exact: true })).toHaveAttribute(
    "data-value",
    "20000000-0000-4000-8000-000000000001",
  );

  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  dialog = await openCreate(page);
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue(
    "",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("field errors focus the right input and a failed save preserves work for retry", async ({
  page,
}) => {
  const project = await taggedProject(page, "Composer retry project", [
    "Valid context",
  ]);
  await page.reload();
  const dialog = await openCreate(page);
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(
    dialog.getByText("Enter a task title (up to 200 characters)."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Task title", { exact: true })).toBeFocused();
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("A safely retried task");
  await selectOption(dialog.getByLabel("Project", { exact: true }), project.id);
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test outage. Please retry." }),
      });
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(
    dialog.getByText("Temporary test outage. Please retry."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue(
    "A safely retried task",
  );
  await expect(dialog.getByLabel("Project", { exact: true })).toHaveAttribute(
    "data-value",
    project.id,
  );
  await expect(dialog.locator(".inherited-project-labels")).toContainText(
    "#valid_context",
  );
  await page.unroute("**/api/workspace");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect((await savedTask(page, "A safely retried task")).labels).toEqual([
    "valid_context",
  ]);
});

test("editing requires an explicit decision before discarding unsaved work", async ({
  page,
}) => {
  const created = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "createTask", task: { title: "An edit worth protecting" } },
  });
  expect(created.ok()).toBe(true);
  await page.reload();
  await nav(page, "All tasks");
  await page
    .getByRole("button", { name: "An edit worth protecting", exact: true })
    .click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("An unsaved change");
  await page.getByLabel("Task title", { exact: true }).press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    "An unsaved change",
  );
  await page.getByLabel("Task title", { exact: true }).press("Escape");
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(editorSurface(page)).toHaveCount(0);
  expect((await savedTask(page, "An edit worth protecting")).title).toBe(
    "An edit worth protecting",
  );
});

test("calendar creation carries the selected project and date into persistence", async ({
  page,
}) => {
  await nav(page, "Launch planning");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  const today = new Date();
  await page
    .getByRole("button", {
      name: `Add task for ${format(today, "EEEE, MMMM d, yyyy")}`,
      exact: true,
    })
    .click();
  const dialog = editorSurface(page);
  await expect(dialog.getByLabel("Due date", { exact: true })).toHaveValue(
    format(today, "yyyy-MM-dd"),
  );
  await expect(dialog.getByLabel("Project", { exact: true })).toHaveAttribute(
    "data-value",
    "20000000-0000-4000-8000-000000000001",
  );
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Calendar context task");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const task = await savedTask(page, "Calendar context task");
  expect(task.dueDate).toBe(format(today, "yyyy-MM-dd"));
  expect(task.projectId).toBe("20000000-0000-4000-8000-000000000001");
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 768, 1000],
  ["mobile", 360, 640],
] as const) {
  test(`task editor stays readable and actions stay visible on ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const dialog = await openCreate(page);
    await settle(page);
    const metrics = await dialog.evaluate((d) => {
      const button = d.querySelector<HTMLButtonElement>('[type="submit"]')!;
      return {
        bottom: button.getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
        title: parseFloat(
          getComputedStyle(d.querySelector("#task-title")!).fontSize,
        ),
        control: parseFloat(
          getComputedStyle(d.querySelector(".app-select")!).fontSize,
        ),
      };
    });
    expect(metrics.bottom).toBeLessThanOrEqual(height);
    expect(metrics.overflow).toBe(false);
    expect(metrics.title).toBeGreaterThanOrEqual(20);
    expect(metrics.title).toBeLessThanOrEqual(22);
    if (width === 360) expect(metrics.control).toBeGreaterThanOrEqual(16);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({ path: `test-results/task-editor-${name}.png` });
    await dialog
      .getByLabel("Task title", { exact: true })
      .fill(`Readable on ${name}`);
    await dialog
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  });
}

test("dark editor passes accessibility checks", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("evolve-theme", "dark");
    document.documentElement.dataset.theme = "dark";
  });
  const dialog = await openCreate(page);
  await dialog.getByRole("button", { name: "Checklist", exact: true }).click();
  await selectOption(
    dialog.getByLabel("Project", { exact: true }),
    "20000000-0000-4000-8000-000000000001",
  );
  await expect(dialog.locator(".inherited-project-labels")).toBeVisible();
  await settle(page);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({ path: "test-results/task-editor-dark.png" });
});

for (const width of [1440, 360]) {
  test(`all primary workspace sections render and remain accessible at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    for (const label of [
      "Overview",
      "Inbox",
      "My tasks",
      "All tasks",
      "People",
      "Activity",
      "Archive",
      "Settings",
    ]) {
      await nav(page, label);
      await expect(page.locator("main h1")).toBeVisible();
      await settle(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        scan.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        label,
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/audit-${label.toLowerCase().replaceAll(" ", "-")}.png`,
        fullPage: true,
      });
    }
  });
}

test("duplicating a maximum-length task title remains valid", async ({
  page,
}) => {
  const title = "A".repeat(200);
  const created = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "createTask", task: { title } },
  });
  expect(created.ok()).toBe(true);
  await page.reload();
  await nav(page, "All tasks");
  await page
    .getByRole("button", { name: `Actions for ${title}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Duplicate task", exact: true })
    .click();
  await expect(
    page.getByText("Task duplicated", { exact: true }),
  ).toBeVisible();
  const copied = await savedTask(page, title.slice(0, 193) + " (copy)");
  expect(copied.title).toHaveLength(200);
});

test("new tasks inherit active assignee, priority, and status filters", async ({
  page,
}) => {
  await nav(page, "All tasks");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await selectOption(page.getByLabel("Status", { exact: true }), "review");
  await selectOption(page.getByLabel("Priority", { exact: true }), "high");
  await selectOption(
    page.getByLabel("Assignee", { exact: true }),
    "jarjirjor777@gmail.com",
  );
  const dialog = await openCreate(page);
  await expect(dialog.getByLabel("Status", { exact: true })).toHaveAttribute(
    "data-value",
    "review",
  );
  await expect(dialog.getByLabel("Priority", { exact: true })).toHaveAttribute(
    "data-value",
    "high",
  );
  await expect(dialog.getByLabel("Assignee", { exact: true })).toHaveAttribute(
    "data-value",
    "jarjirjor777@gmail.com",
  );
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("A task matching this view");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "A task matching this view",
      exact: true,
    }),
  ).toBeVisible();
});

test("a queued draft autosave cannot restore a task after creation commits", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const taskWindow = window as unknown as { queuedDraftSave?: () => void };
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 250 && typeof callback === "function")
        taskWindow.queuedDraftSave = () => callback(...args);
      return schedule(callback, delay, ...args);
    }) as typeof window.setTimeout;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      remove.call(this, key);
      if (
        key.startsWith("evolve-task-draft-v1:") &&
        taskWindow.queuedDraftSave
      ) {
        const callback = taskWindow.queuedDraftSave;
        taskWindow.queuedDraftSave = undefined;
        queueMicrotask(callback);
      }
    };
  });
  await page.reload();
  let dialog = await openCreate(page);
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Committed task must stay cleared");
  await dialog.getByLabel("Task title", { exact: true }).press("Escape");
  await expect(dialog).toHaveCount(0);
  dialog = await openCreate(page);
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { queuedDraftSave?: unknown })
            .queuedDraftSave,
      ),
    )
    .toBe("function");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  dialog = await openCreate(page);
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue(
    "",
  );
});
