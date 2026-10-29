import { editorSurface, selectOption } from "./ui-helpers";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
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
async function nav(page: Page, label: string) {
  await page.locator(".topbar").waitFor();
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: label, exact: true })
    .click();
}
async function scan(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
}
test("signed-out access fails closed and CSRF requests are rejected", async ({
  request,
}) => {
  const get = await request.get("/api/workspace");
  expect(get.status()).toBe(401);
  const post = await request.post("/api/workspace", {
    headers: { origin: "https://malicious.example" },
    data: { action: "readNotifications" },
  });
  expect(post.status()).toBe(403);
});
test("outsiders and unverified accounts cannot read task data", async ({
  context,
  page,
}) => {
  for (const role of ["e2e-outsider", "e2e-unverified"]) {
    await context.clearCookies();
    await signIn(context, role);
    const res = await page.request.get("/api/workspace");
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.tasks).toBeUndefined();
  }
});
test("member authorization is enforced by the API", async ({
  context,
  page,
}) => {
  await signIn(context, "e2e-member");
  const r = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "inviteMember",
      name: "Intruder",
      email: "intruder@example.com",
    },
  });
  expect(r.status()).toBe(403);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Invite", exact: true }),
  ).toHaveCount(0);
});
test("admin can create and edit a task, persist comments, archive, and restore it", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  let dialog = editorSurface(page);
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("A thoroughly tested next step");
  await selectOption(dialog.getByLabel("Project", { exact: true }), {
    label: "Launch planning",
  });
  await selectOption(dialog.getByLabel("Assignee", { exact: true }), {
    label: "Team Member",
  });
  await selectOption(dialog.getByLabel("Priority", { exact: true }), "high");
  await dialog.getByLabel("Due date", { exact: false }).fill("2026-12-15");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("From interface to API to PostgreSQL.");
  await dialog.getByRole("button", { name: "Checklist", exact: true }).click();
  await dialog
    .getByLabel("New checklist item")
    .fill("Confirm persistence after reload");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await nav(page, "All tasks");
  await page
    .getByRole("button", { name: "A thoroughly tested next step", exact: true })
    .click();
  dialog = editorSurface(page);
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    "From interface to API to PostgreSQL.",
  );
  await dialog
    .getByLabel("Confirm persistence after reload", { exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await nav(page, "All tasks");
  await page
    .getByRole("button", { name: "A thoroughly tested next step", exact: true })
    .click();
  dialog = editorSurface(page);
  await expect(
    dialog.getByLabel("Confirm persistence after reload", { exact: true }),
  ).toBeChecked();
  await dialog
    .getByLabel("Comment", { exact: true })
    .fill("A real database-backed comment.");
  await dialog
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await expect(
    dialog.getByText("A real database-backed comment.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: /^(Close dialog|Back to workspace)$/,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "A thoroughly tested next step", exact: true })
    .click();
  await expect(
    page.getByText("A real database-backed comment.", { exact: true }),
  ).toBeVisible();
  await editorSurface(page)
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(editorSurface(page)).toHaveCount(0);
  await nav(page, "Archive");
  await page
    .getByRole("button", { name: "A thoroughly tested next step", exact: true })
    .click();
  await editorSurface(page)
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await nav(page, "All tasks");
  await expect(
    page.getByRole("button", {
      name: "A thoroughly tested next step",
      exact: true,
    }),
  ).toBeVisible();
});
test("board status menus, filters, calendar, and search are functional", async ({
  page,
}) => {
  await page.goto("/demo");
  await nav(page, "All tasks");
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Actions for Refine the homepage experience",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "In review", exact: true }).click();
  const review = page.locator(".kanban-column").filter({
    has: page.getByRole("heading", { name: "In review", exact: true }),
  });
  await expect(
    review.getByRole("button", {
      name: "Refine the homepage experience",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await selectOption(
    page.locator(".filter-bar").getByLabel("Priority", { exact: true }),
    "urgent",
  );
  await expect(
    page.getByRole("button", {
      name: "Finalize the launch checklist",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Refine the homepage experience",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".calendar-days")).toBeVisible();
  // Include today's marker and adjacent-month dates in both theme checks.
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const calendarScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      calendarScan.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.keyboard.press("Control+f");
  await page
    .getByRole("combobox", { name: "Search all tasks", exact: true })
    .fill("Refine the homepage");
  await page.keyboard.press("Enter");
  await expect(
    editorSurface(page).getByLabel("Task title", { exact: true }),
  ).toHaveValue("Refine the homepage experience");
});
test("invitations grant member access and sole administrator cannot be removed", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app");
  await nav(page, "People");
  await page
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  const dialog = editorSurface(page);
  await dialog.getByLabel("Full name", { exact: true }).fill("New Teammate");
  await dialog
    .getByLabel("Google email address", { exact: true })
    .fill("new-teammate@example.com");
  await dialog
    .getByRole("button", { name: "Approve teammate", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New Teammate", exact: true }),
  ).toBeVisible();
  const admin = page.locator(".person-card").filter({
    has: page.getByRole("heading", { name: "Workspace Admin", exact: false }),
  });
  await expect(
    admin.getByRole("button", { name: "Revoke access", exact: true }),
  ).toHaveCount(0);
});
test("task page focuses its title and Escape restores the creation action", async ({
  page,
}) => {
  await page.goto("/demo");
  const button = page.getByRole("button", { name: "New task", exact: true });
  await button.click();
  await expect(
    editorSurface(page).getByLabel("Task title", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editorSurface(page)).toHaveCount(0);
  await expect(button).toBeFocused();
});
test("Google OAuth initiation uses Google with state and a callback URI", async ({
  request,
}) => {
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { provider: "google", callbackURL: "/app" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const url = new URL(body.url);
  expect(url.hostname).toBe("accounts.google.com");
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:3100/api/auth/callback/google",
  );
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
});
test("desktop and mobile views have no overflow or serious accessibility violations", async ({
  page,
}) => {
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo");
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await scan(page);
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes
          .slice(0, 4)
          .map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/overview-${width}.png`,
      fullPage: true,
    });
  }
});
test("task dialog and sign-in page pass accessibility checks", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  expect(
    (await scan(page)).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .getByRole("button", {
      name: /^(Close dialog|Back to workspace)$/,
      exact: true,
    })
    .click();
  await page.goto("/");
  expect(
    (await scan(page)).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
test("dark theme remains readable and survives reload", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page
    .getByRole("button", { name: "Save account settings", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    (await scan(page)).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes
        .slice(0, 5)
        .map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});

test("a late refresh cannot revert a task that just saved", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app");
  await nav(page, "All tasks");
  let release: (() => void) | undefined;
  let intercepted: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  const completed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "GET" && !held) {
      held = true;
      const old = await route.fetch();
      intercepted?.();
      await completed;
      await route.fulfill({ response: old });
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await blocked;
  await page
    .getByRole("button", {
      name: "Complete Review our launch plan",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reopen Review our launch plan",
      exact: true,
    }),
  ).toBeVisible();
  release?.();
  await expect(
    page.getByRole("button", { name: "Refresh workspace", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Reopen Review our launch plan",
      exact: true,
    }),
  ).toBeVisible();
});

test("mobile navigation and a task edit work at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/demo");
  await nav(page, "All tasks");
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await page
    .getByRole("button", { name: "Add task in In review", exact: true })
    .click();
  const dialog = editorSurface(page);
  await expect(
    dialog.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveAttribute("data-value", "review");
  await dialog
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("A mobile-sized next step");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "A mobile-sized next step", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await scan(page);
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes
        .slice(0, 4)
        .map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/mobile-board.png",
    fullPage: true,
  });
});

test("a thousand tasks remain paginated, searchable, and exportable", async ({
  context,
  page,
}, testInfo) => {
  const url = new URL(
    process.env.EVOLVE_E2E_DATABASE_URL || process.env.DATABASE_URL!,
  );
  url.pathname = "/evolve_e2e";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(
      "INSERT INTO task(id,title,created_by) SELECT gen_random_uuid()::text,'Scale task '||n,'jarjirjor777@gmail.com' FROM generate_series(1,1000) n",
    );
  } finally {
    await client.end();
  }
  await signIn(context);
  const started = performance.now();
  const response = await page.request.get("/api/workspace");
  expect(response.status()).toBe(200);
  const body = await response.text();
  const firstPage = JSON.parse(body);
  const apiMs = performance.now() - started;
  expect(firstPage.tasks).toHaveLength(500);
  expect(firstPage.nextCursor).toBeTruthy();
  expect(Buffer.byteLength(body)).toBeLessThan(500000);
  expect(apiMs).toBeLessThan(5000);
  const navigation = performance.now();
  await page.goto("/app");
  await nav(page, "All tasks");
  const renderMs = performance.now() - navigation;
  expect(renderMs).toBeLessThan(10000);
  await expect(page.locator(".task-row")).toHaveCount(200);
  for (let i = 0; i < 10; i++) {
    const more = page.getByRole("button", {
      name: "Load more tasks",
      exact: true,
    });
    if ((await more.count()) === 0) break;
    const rowCount = await page.locator(".task-row").count();
    const totalCount = await page.locator(".page-task-count").textContent();
    const loaded = page.waitForResponse(
      (response) =>
        response.url().includes("/api/tasks?") &&
        new URL(response.url()).searchParams.has("cursor") &&
        response.ok(),
    );
    await more.click();
    await loaded;
    await expect
      .poll(() => page.locator(".task-row").count())
      .toBeGreaterThan(rowCount);
    await expect(page.locator(".page-task-count")).toHaveText(totalCount!);
  }
  await expect(
    page.getByRole("button", { name: "Load more tasks", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("Scale task 1000");
  await expect(
    page.getByRole("button", { name: "Scale task 1000", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export this view as CSV", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^evolve-tasks-.*\.csv$/,
  );
  const metrics = {
    tasks: 1000,
    initialPage: 500,
    apiMs: Math.round(apiMs),
    renderMs: Math.round(renderMs),
    payloadBytes: Buffer.byteLength(body),
  };
  console.log("Local production smoke metrics", metrics);
  await testInfo.attach("local-production-smoke.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
});
