import { editorSurface, selectOption } from "./ui-helpers";
import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
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
async function command(request: APIRequestContext, data: unknown) {
  const response = await request.post("/api/workspace", {
    headers: { origin },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function workspace(request: APIRequestContext) {
  const r = await request.get("/api/workspace");
  expect(r.ok()).toBeTruthy();
  return r.json();
}

test("member profile persists and workspace branding remains administrator-only", async ({
  browser,
  context,
  page,
}) => {
  await signIn(context);
  const memberContext = await browser.newContext();
  await signIn(memberContext, "e2e-member");
  const member = await memberContext.newPage();
  const initial = await workspace(member.request);
  try {
    await member.goto("/app?section=settings");
    await expect(
      member.getByRole("tab", { name: "Workspace", exact: true }),
    ).toHaveCount(0);
    await member
      .getByLabel("Display name", { exact: true })
      .fill("Anggota Evolve");
    await member.getByLabel("Job title", { exact: true }).fill("Desainer");
    await member
      .getByRole("button", { name: "Save account settings", exact: true })
      .click();
    await expect(
      member.getByText("Account settings saved", { exact: true }),
    ).toBeVisible();
    await member.reload();
    await expect(
      member.getByLabel("Display name", { exact: true }),
    ).toHaveValue("Anggota Evolve");
    const denied = await member.request.post("/api/workspace", {
      headers: { origin },
      data: {
        action: "updateWorkspace",
        ...initial.settings,
        name: "No access",
      },
    });
    expect(denied.status()).toBe(403);
    await page.goto("/app?section=settings");
    await page.getByRole("tab", { name: "Workspace", exact: true }).click();
    await page
      .getByLabel("Workspace name", { exact: true })
      .fill("Evolve Rensist");
    await page
      .getByRole("button", { name: "Save workspace", exact: true })
      .click();
    await expect(
      page.getByText("Workspace updated", { exact: true }),
    ).toBeVisible();
    await page.reload();
    expect((await workspace(page.request)).settings.name).toBe(
      "Evolve Rensist",
    );
  } finally {
    const memberNow = await workspace(member.request);
    await command(member.request, {
      action: "updateProfile",
      ...initial.profile,
      version: memberNow.profile.version,
    });
    const adminNow = await workspace(page.request);
    await command(page.request, {
      action: "updateWorkspace",
      ...initial.settings,
      version: adminNow.settings.version,
    });
    await memberContext.close();
  }
});

test("CSV preview blocks invalid rows, imports once, then bulk editing persists across reload", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app?section=tasks");
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const dialog = editorSurface(page);
  const input = dialog.locator("input[type=file]");
  await input.setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Title,Assignee\nDo not import,nobody@example.com"),
  });
  await expect(
    dialog.getByRole("button", { name: "Import 0 tasks", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("Row 2");
  await input.setInputFiles({
    name: "valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Title,Description\nBrowser CSV A,"Line 1\nLine 2"\nBrowser CSV B,Second task',
    ),
  });
  await expect(
    dialog.getByRole("button", { name: "Import 2 tasks", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Import 2 tasks", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("Browser CSV");
  await expect(
    page.getByRole("button", { name: "Browser CSV A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Browser CSV B", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit", exact: true }).click();
  const bulk = editorSurface(page);
  await bulk
    .getByRole("checkbox", { name: /Select the first 2 tasks/ })
    .check();
  await selectOption(
    bulk.getByRole("combobox", { name: "Priority", exact: true }),
    "urgent",
  );
  await bulk.getByRole("button", { name: /Apply.*2/ }).click();
  await expect(bulk).toHaveCount(0);
  await page.reload();
  const saved = await page.request.get("/api/tasks?q=Browser%20CSV");
  const tasks = (await saved.json()).tasks;
  expect(tasks).toHaveLength(2);
  expect(
    tasks.every((t: { priority: string }) => t.priority === "urgent"),
  ).toBeTruthy();
});

test("independent task templates and recurrence persist without relationship controls", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app?section=tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = editorSurface(page);
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Browser planned task");
  await dialog.getByLabel("Due date", { exact: true }).fill("2026-12-01");
  await dialog.getByLabel("Due time", { exact: true }).fill("09:00");
  await selectOption(
    dialog.getByLabel("Deadline time zone", { exact: true }),
    "Asia/Jayapura",
  );
  await selectOption(
    dialog.getByRole("combobox", { name: /Repeat task/ }),
    "monthly",
  );
  await dialog
    .getByRole("button", { name: "Task templates", exact: true })
    .click();
  await dialog
    .getByPlaceholder("Template name", { exact: true })
    .fill("Browser release template");
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByText("Template saved", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const query = await page.request.get("/api/tasks?q=Browser%20planned%20task");
  const task = (await query.json()).tasks[0];
  expect(task.dependencies).toEqual([]);
  expect(task.recurrence).toBe("monthly");
  expect(task.dueTimeZone).toBe("Asia/Jayapura");
  await page.goto(`/app?task=${task.id}`);
  const detail = editorSurface(page);
  await expect(
    detail.getByLabel("New subtask title", { exact: true }),
  ).toHaveCount(0);
  await expect(
    detail.getByRole("combobox", {
      name: "Waiting for these tasks",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    detail.getByRole("heading", { name: "Google Calendar", exact: true }),
  ).toBeVisible();
});

test("task and project attachments upload, survive reload, and reject anonymous downloads and other-member deletion", async ({
  browser,
  context,
  page,
}) => {
  await signIn(context);
  const data = await workspace(page.request);
  const task = (
    await command(page.request, {
      action: "createTask",
      task: { title: "Browser attachment task" },
    })
  ).task;
  for (const [entityType, entityId] of [
    ["task", task.id],
    ["project", data.projects[0].id],
  ]) {
    const reservation = await page.request.post("/api/attachments", {
      headers: { origin },
      data: {
        entityType,
        entityId,
        filename: "Browser notes.txt",
        contentType: "text/plain",
        size: 18,
      },
    });
    expect(reservation.ok(), await reservation.text()).toBeTruthy();
    const upload = await reservation.json();
    const bytes = Buffer.from("Private team notes");
    expect(bytes.length).toBe(18);
    const local = await page.request.post(
      `/api/attachments/local-upload?id=${upload.id}`,
      { headers: { origin, "content-type": "text/plain" }, data: bytes },
    );
    expect(local.ok(), await local.text()).toBeTruthy();
    const finish = await page.request.post(`/api/attachments/${upload.id}`, {
      headers: { origin },
    });
    expect(finish.ok()).toBeTruthy();
    await page.goto(
      entityType === "task"
        ? `/app?task=${task.id}`
        : `/app?section=project&project=${entityId}`,
    );
    await expect(
      page.getByText("Browser notes.txt", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Browser notes.txt", { exact: true }),
    ).toBeVisible();
    const download = await page.request.get(
      `/api/attachments/${upload.id}/content?download`,
    );
    expect(await download.text()).toBe("Private team notes");
    expect(download.headers()["cache-control"]).toContain("private");
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    const outsider = await browser.newContext();
    expect(
      (
        await outsider.request.get(
          `${origin}/api/attachments/${upload.id}/content`,
        )
      ).status(),
    ).toBe(401);
    await outsider.close();
    const member = await browser.newContext();
    await signIn(member, "e2e-member");
    expect(
      (
        await member.request.delete(`${origin}/api/attachments/${upload.id}`, {
          headers: { origin },
        })
      ).status(),
    ).toBe(403);
    await member.close();
    expect(
      (
        await page.request.delete(`/api/attachments/${upload.id}`, {
          headers: { origin },
        })
      ).ok(),
    ).toBeTruthy();
  }
});

test("a committed assignment reaches another browser inbox within three seconds and opens from its notification", async ({
  browser,
  context,
  page,
}) => {
  await signIn(context);
  const other = await browser.newContext();
  await signIn(other, "e2e-member");
  const member = await other.newPage();
  try {
    await member.goto("/app?section=inbox");
    await expect(
      member.getByText("Live · saved", { exact: true }),
    ).toBeVisible();
    const title = `Realtime browser ${Date.now()}`;
    const start = performance.now();
    const result = await command(page.request, {
      action: "createTask",
      task: { title, assignee: "member@example.com" },
    });
    const notification = member
      .locator(".notification-row")
      .filter({ hasText: title });
    await expect(notification).toBeVisible({ timeout: 3000 });
    const latency = performance.now() - start;
    console.log(`Realtime browser delivery: ${Math.round(latency)} ms`);
    expect(latency).toBeLessThan(3000);
    await notification.click();
    await expect(
      editorSurface(member).getByLabel("Task title", { exact: true }),
    ).toHaveValue(title);
    await expect
      .poll(async () => {
        const r = await workspace(member.request);
        return r.notifications.find(
          (n: { taskId: string }) => n.taskId === result.task.id,
        )?.read;
      })
      .toBe(true);
  } finally {
    await other.close();
  }
});

for (const width of [1440, 390]) {
  test(`settings tabs and task planning remain accessible at ${width}px`, async ({
    context,
    page,
  }) => {
    await signIn(context);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/app?section=settings");
    await mkdir("docs/screenshots/features", { recursive: true });
    for (const tab of [
      "My account",
      "Appearance",
      "Google Calendar",
      "Workspace",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
    await page.screenshot({
      path: `docs/screenshots/features/settings-${width}.png`,
      fullPage: true,
    });
    await page.goto("/app?section=tasks");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = editorSurface(page);
    await dialog
      .getByLabel("Task title", { exact: true })
      .fill("Susun peluncuran berikutnya");
    await dialog.getByLabel("Due date", { exact: true }).fill("2026-12-01");
    await dialog.getByLabel("Due time", { exact: true }).fill("10:00");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: `docs/screenshots/features/task-planning-${width}.png`,
      fullPage: true,
    });
  });
}
test("Calendar consent is separate per account, uses PKCE, and rejects forged callbacks and public maintenance", async ({
  context,
  page,
  request,
}) => {
  await signIn(context);
  await page.goto("/app?section=settings&tab=calendar");
  await expect(
    page.getByRole("button", {
      name: "Connect Google Calendar",
      exact: true,
    }),
  ).toBeVisible();
  const response = await page.request.post("/api/calendar", {
    headers: { origin },
    data: { action: "connect" },
  });
  expect(response.ok()).toBeTruthy();
  const consent = new URL((await response.json()).url);
  expect(consent.hostname).toBe("accounts.google.com");
  expect(consent.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/calendar/callback`,
  );
  expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
  expect(consent.searchParams.get("scope")).toContain("calendar.app.created");
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  expect(response.headers()["set-cookie"]).toMatch(/SameSite=lax/i);
  const forged = await page.request.get(
    "/api/calendar/callback?state=forged&code=forged",
    { maxRedirects: 0 },
  );
  expect(forged.status()).toBe(307);
  expect(forged.headers().location).toContain("calendar=failed");
  expect((await request.get("/api/calendar")).status()).toBe(401);
  expect(
    (await request.get("/api/maintenance")).status(),
  ).toBeGreaterThanOrEqual(400);
});
