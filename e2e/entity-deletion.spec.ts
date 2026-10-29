import { historicalProject } from "./historical-project-fixture";
import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
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
async function command(request: APIRequestContext, data: object) {
  const response = await request.post("/api/workspace", {
    headers: { origin },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function upload(
  request: APIRequestContext,
  entityType: string,
  entityId: string,
) {
  const reservation = await request.post("/api/attachments", {
    headers: { origin },
    data: {
      entityType,
      entityId,
      filename: "Delete scope.txt",
      contentType: "text/plain",
      size: 12,
    },
  });
  expect(reservation.ok(), await reservation.text()).toBeTruthy();
  const file = await reservation.json();
  expect(
    (
      await request.post(`/api/attachments/local-upload?id=${file.id}`, {
        headers: { origin, "content-type": "text/plain" },
        data: Buffer.from("Private file"),
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`/api/attachments/${file.id}`, { headers: { origin } })
    ).ok(),
  ).toBeTruthy();
  return file;
}

test("admin deletes a task through confirmation, recovers a lost response and persists removal without affecting other work", async ({
  page,
  context,
}) => {
  await signIn(context);
  const task = (
    await command(page.request, {
      action: "createTask",
      task: {
        title: "Delete task vertical slice",
        assignee: "member@example.com",
      },
    })
  ).task;
  const other = (
    await command(page.request, {
      action: "createTask",
      task: { title: "Preserve other task" },
    })
  ).task;
  await command(page.request, {
    action: "addComment",
    taskId: task.id,
    body: "Removed with deleted task",
  });
  const file = await upload(page.request, "task", task.id);
  await page.goto(`/app?section=tasks&task=${task.id}`);
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete task?",
    exact: true,
  });
  await expect(dialog.getByText(task.title, { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Delete task", exact: true }),
  ).not.toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(200);
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  let first = true;
  const keys: string[] = [];
  await page.route("**/api/workspace", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON()?.action === "deleteTask"
    ) {
      keys.push(request.postDataJSON().idempotencyKey);
      if (first) {
        first = false;
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        await route.fulfill({
          status: 503,
          json: { error: "Response lost after saving. Retry safely." },
        });
        return;
      }
    }
    await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Delete task", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Response lost after saving. Retry safely.",
  );
  await expect(page.locator(".task-page-heading h1")).toHaveText(
    "Task details",
  );
  expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
  await dialog
    .getByRole("button", { name: "Delete task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(
    page.getByRole("region", { name: "Task editor", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  expect(new URL(page.url()).searchParams.has("task")).toBe(false);
  expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
  expect(
    (await page.request.get(`/api/workspace?taskId=${task.id}`)).status(),
  ).toBe(404);
  expect(
    (await page.request.get(`/api/attachments/${file.id}/content`)).status(),
  ).toBe(404);
  expect((await page.request.get(`/api/tasks/${other.id}`)).status()).toBe(200);
});

test("project deletion confirms financial/file removal, preserves active and archived tasks and returns to Projects", async ({
  page,
  context,
}) => {
  await signIn(context);
  const project = await historicalProject(page, {
    name: "Deletion project browser",
    color: "green",
    costItems: [
      {
        id: crypto.randomUUID(),
        title: "Planning",
        amount: "120.00",
        currency: "USD",
      },
    ],
  });
  const tasks = [];
  for (const title of [
    "Keep active after project removal",
    "Keep archived after project removal",
  ])
    tasks.push(
      (
        await command(page.request, {
          action: "createTask",
          task: { title, projectId: project.id },
        })
      ).task,
    );
  await command(page.request, {
    action: "updateTask",
    id: tasks[1].id,
    version: tasks[1].version,
    patch: { archived: true },
  });
  await command(page.request, {
    action: "addComment",
    taskId: tasks[0].id,
    body: "Keep this task discussion",
  });
  // Retained pre-retirement data must still cascade when its project is deleted.
  const databaseUrl = new URL(
    process.env.EVOLVE_E2E_DATABASE_URL || process.env.DATABASE_URL!,
  );
  if (
    !process.env.EVOLVE_E2E_DATABASE_URL &&
    !["127.0.0.1", "localhost"].includes(databaseUrl.hostname)
  )
    throw new Error("Historical fixtures require a disposable database.");
  databaseUrl.pathname = "/evolve_e2e";
  const historical = new Client({ connectionString: databaseUrl.toString() });
  await historical.connect();
  try {
    await historical.query(
      "INSERT INTO project_expense(id,project_id,currency,amount,description,category,booked_on,created_by) VALUES($1,$2,'USD','10.50','Remove this project expense','other','2026-10-18','jarjirjor777@gmail.com')",
      [crypto.randomUUID(), project.id],
    );
  } finally {
    await historical.end();
  }
  const file = await upload(page.request, "project", project.id);
  const taskFile = await upload(page.request, "task", tasks[0].id);
  await page.goto(`/app?section=project&project=${project.id}`);
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete project?",
    exact: true,
  });
  await expect(dialog).toContainText("Expense history");
  const remove = dialog.getByRole("button", {
    name: "Delete project",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await dialog
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await remove.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#main-content h1")).toHaveText("Projects");
  await expect(page.locator("#main-content h1")).toBeFocused();
  await page.reload();
  const data = await (await page.request.get("/api/workspace")).json();
  expect(data.projects.some((p: { id: string }) => p.id === project.id)).toBe(
    false,
  );
  for (const task of tasks) {
    const kept = (
      await (await page.request.get(`/api/tasks/${task.id}`)).json()
    ).task;
    expect(kept.projectId).toBe(null);
    expect(kept.archived).toBe(task.id === tasks[1].id);
  }
  const discussion = await (
    await page.request.get(`/api/workspace?taskId=${tasks[0].id}`)
  ).json();
  expect(
    discussion.comments.some(
      (c: { body: string }) => c.body === "Keep this task discussion",
    ),
  ).toBe(true);
  expect(
    (await page.request.get(`/api/attachments/${file.id}/content`)).status(),
  ).toBe(404);
  expect(
    await (
      await page.request.get(`/api/attachments/${taskFile.id}/content`)
    ).text(),
  ).toBe("Private file");
});

test("a lost project-deletion response leaves an honest missing-project state after cancellation", async ({
  page,
  context,
}) => {
  await signIn(context);
  const project = (
    await command(page.request, {
      action: "createProject",
      name: "Lost project deletion response",
      color: "green",
    })
  ).project;
  await page.goto(`/app?section=project&project=${project.id}`);
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page.route("**/api/workspace", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "deleteProject"
    ) {
      expect((await route.fetch()).ok()).toBeTruthy();
      await route.fulfill({
        status: 503,
        json: { error: "Project response lost" },
      });
    } else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("Project response lost");
  const missingProject = page.getByRole("heading", {
    name: "Project no longer available",
    exact: true,
    includeHidden: true,
  });
  await expect(missingProject).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(missingProject).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit project", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Back to Projects", exact: true })
    .click();
  await expect(page.locator("#main-content h1")).toHaveText("Projects");
});

test("members and outsiders cannot delete; origin protection and stale versions preserve data", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  const project = (
    await command(page.request, {
      action: "createProject",
      name: "Protected deletion",
      color: "green",
    })
  ).project;
  const task = (
    await command(page.request, {
      action: "createTask",
      task: { title: "Protected deletion task", projectId: project.id },
    })
  ).task;
  const member = await browser.newContext({ baseURL: origin });
  const anonymous = await browser.newContext({ baseURL: origin });
  await signIn(member, "e2e-member");
  try {
    for (const [action, entity] of [
      ["deleteTask", task],
      ["deleteProject", project],
    ] as const) {
      const data = {
        action,
        id: entity.id,
        version: entity.version,
        idempotencyKey: crypto.randomUUID(),
      };
      expect(
        (
          await member.request.post("/api/workspace", {
            headers: { origin },
            data,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await anonymous.request.post("/api/workspace", {
            headers: { origin },
            data,
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await page.request.post("/api/workspace", {
            headers: { origin: "https://outsider.example" },
            data,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.post("/api/workspace", {
            headers: { origin },
            data: { ...data, version: entity.version + 1 },
          })
        ).status(),
      ).toBe(409);
    }
    const memberPage = await member.newPage();
    await memberPage.goto(`/app?section=project&project=${project.id}`);
    await expect(
      memberPage.getByRole("button", { name: "Delete project", exact: true }),
    ).toHaveCount(0);
    await memberPage
      .getByRole("button", { name: task.title, exact: true })
      .click();
    await expect(
      memberPage.getByRole("button", { name: "Delete task", exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(
      200,
    );
  } finally {
    await member.close();
    await anonymous.close();
  }
});

test("task editor preserves unsaved changes and uses the saved version for deletion", async ({
  page,
  context,
}) => {
  await signIn(context);
  const task = (
    await command(page.request, {
      action: "createTask",
      task: { title: "Deletion draft guard" },
    })
  ).task;
  await page.goto(`/app?task=${task.id}`);
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Save before deleting");
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Task editor", exact: true })
      .getByRole("alert"),
  ).toContainText("Save or discard your changes");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveCount(0);
  await page.goto(`/app?task=${task.id}`);
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete task", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 740 },
  { width: 320, height: 568 },
  { width: 568, height: 320 },
]) {
  test(`deletion dialogs preserve proportions, focus, and fixed actions at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      "/demo?section=project&project=00000000-0000-4000-8000-000000000001",
    );
    await page
      .getByRole("button", { name: "Delete project", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.y).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 12);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 11);
    await expect(
      dialog.getByLabel("Type DELETE to confirm", { exact: true }),
    ).toBeFocused();
    for (const button of await dialog.locator(".form-actions button").all())
      await expect(button).toBeInViewport({ ratio: 1 });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/delete-project-${viewport.width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Delete project", exact: true }),
    ).toBeFocused();
    await page.goto("/demo?section=tasks");
    await page
      .getByRole("button", { name: /^Actions for / })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: "Delete task", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    for (const button of await dialog.locator(".form-actions button").all())
      await expect(button).toBeInViewport({ ratio: 1 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await expect
      .poll(() =>
        page
          .locator(".brand-word strong")
          .first()
          .evaluate((element) => getComputedStyle(element).color),
      )
      .toBe("rgb(224, 230, 218)");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Actions for / }).first(),
    ).toBeFocused();
  });
}
