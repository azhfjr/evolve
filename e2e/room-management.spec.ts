import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { createHmac, randomUUID } from "node:crypto";
import { configureTestDatabase } from "../tests/helpers";
import { readCSV } from "../src/lib/board-room/csv";
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
async function project(request: APIRequestContext, name: string) {
  const response = await request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: {
        externalId: `ROOM-${crypto.randomUUID()}`,
        name,
        category: "Transmisi",
        capacity: 100,
        unit: "kms",
        codYear: 2030,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).project;
}
async function upload(
  request: APIRequestContext,
  entityType: string,
  entityId: string,
  filename: string,
) {
  const bytes = "Separate room file content";
  const response = await request.post("/api/attachments", {
    headers: { origin },
    data: {
      entityType,
      entityId,
      filename,
      contentType: "text/plain",
      size: Buffer.byteLength(bytes),
    },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  expect(
    (
      await request.post(`/api/attachments/local-upload?id=${id}`, {
        headers: { origin, "Content-Type": "text/plain" },
        data: bytes,
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`/api/attachments/${id}`, {
        headers: { origin },
      })
    ).ok(),
  ).toBeTruthy();
  return id;
}
test.beforeEach(async ({ context }) => signIn(context));
test("both sidebars remove the workspace card and management stays inside its room", async ({
  page,
}) => {
  for (const [route, sidebar] of [
    ["/app", ".sidebar"],
    ["/board-room", ".br-desktop-sidebar"],
  ]) {
    await page.goto(route);
    const nav = page.locator(sidebar);
    await expect(nav.locator(".workspace-picker")).toHaveCount(0);
    for (const name of [
      "People",
      "Activity",
      "Files",
      route === "/app" ? "Task Templates" : "Import & Workflow Guides",
    ]) {
      await nav.getByRole("button", { name, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`${route.replace("/", "\\/")}\\?`),
      );
      await expect(
        nav.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator("main")).toBeVisible();
    }
  }
  await expect(
    page.getByRole("link", { name: "Download CSV template", exact: true }),
  ).toHaveAttribute("href", "/board-room/project-upload-template.csv");
  await page
    .getByRole("button", { name: "View project stages", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Shared project stages", exact: true }),
  ).toBeVisible();
  await page
    .locator(".br-desktop-sidebar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page).toHaveURL(/\/board-room\?.*section=preferences/);
  await expect(
    page.getByRole("button", { name: "Export projects", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Files", exact: true }),
  ).toBeVisible();
});
test("Board and Locker file managers retain download and removal features with isolated inventories", async ({
  page,
}) => {
  const p = await project(page.request, `File management ${Date.now()}`);
  const suffix = crypto.randomUUID().slice(0, 8);
  const boardName = `board-${suffix}.txt`,
    lockerName = `locker-${suffix}.txt`;
  const boardId = await upload(
    page.request,
    "boardRoomProject",
    p.id,
    boardName,
  );
  const lockerId = await upload(
    page.request,
    "taskDraft",
    crypto.randomUUID(),
    lockerName,
  );
  const reviewed = (
    await (await page.request.get(`/api/board-room?id=${p.id}`)).json()
  ).project;
  expect(
    (
      await page.request.post("/api/board-room", {
        headers: { origin },
        data: {
          action: "review",
          id: p.id,
          version: reviewed.version,
          documentRevision: reviewed.documentRevision,
          valid: true,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/board-room?section=files");
  const manager = page.getByLabel("Board Room file management", {
    exact: true,
  });
  await expect(manager.getByText(boardName, { exact: true })).toBeVisible();
  await expect(manager.getByText(lockerName, { exact: true })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await manager
    .getByRole("button", { name: `Download ${boardName}`, exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(boardName);
  const forged = await page.request.delete("/api/attachments/manage", {
    headers: { origin },
    data: { room: "board", ids: [boardId, lockerId] },
  });
  expect(forged.status()).toBe(403);
  await manager
    .getByRole("button", { name: `Delete ${boardName}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    manager
      .locator("tbody tr")
      .filter({ hasText: boardName })
      .locator(".file-state"),
  ).toHaveText("Removing");
  expect(
    (await page.request.get(`/api/attachments/${boardId}/content`)).status(),
  ).toBe(404);
  await page
    .locator(".br-desktop-sidebar")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  await expect(page.getByRole("row").filter({ hasText: p.name })).toContainText(
    "No files",
  );
  const after = (
    await (await page.request.get(`/api/board-room?id=${p.id}`)).json()
  ).project;
  expect(after.valid).toBe(false);
  await page.goto("/app?section=files");
  const locker = page.getByLabel("Locker Room file management", {
    exact: true,
  });
  await expect(locker.getByText(lockerName, { exact: true })).toBeVisible();
  await expect(locker.getByText(boardName, { exact: true })).toHaveCount(0);
  await locker
    .getByRole("checkbox", { name: `Select ${lockerName}`, exact: true })
    .check();
  await locker.getByRole("button", { name: /Delete selected/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    locker
      .locator("tbody tr")
      .filter({ hasText: lockerName })
      .locator(".file-state"),
  ).toHaveText("Removing");
  expect(
    (await page.request.get(`/api/attachments/${lockerId}/content`)).status(),
  ).toBe(404);
});
test("Board journal opens Board projects and only removes its own activity entries", async ({
  page,
}) => {
  const name = `Board journal ${Date.now()}`;
  await project(page.request, name);
  await page.goto("/board-room?section=activity");
  await expect(
    page.getByRole("heading", { name: "Board Room journal", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search activity", exact: true })
    .fill(name);
  const entry = page.getByRole("button", {
    name: `Created project: ${name}`,
    exact: true,
  });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(
    page.getByRole("dialog", { name: new RegExp(name) }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/board-room/);
  await page
    .getByRole("button", {
      name: `Delete activity: Created project: ${name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete activity", exact: true })
    .click();
  await expect(entry).toHaveCount(0);
});
test("readable chart hierarchy and management layouts work on desktop and phone", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    for (const route of ["/app", "/board-room"]) {
      await page.goto(route);
      const selectors =
        route === "/app"
          ? [
              ".overview-analytics-grid header p",
              ".overview-dashboard .metric-card > span",
              ".overview-bar-heading",
              ".overview-schedule-day strong",
              ".overview-schedule-day time",
              ".overview-bar-row small",
            ]
          : [
              ".br-stage-counts strong",
              ".br-stage-counts span",
              ".dashboard-card .br-panel-heading p",
              ".dashboard-summary span",
            ];
      for (const selector of selectors) {
        const elements = page.locator(selector);
        await expect(elements.first()).toBeVisible();
        const sizes = await elements.evaluateAll((items) =>
          items.map((el) => parseFloat(getComputedStyle(el).fontSize)),
        );
        expect(Math.min(...sizes), selector).toBeGreaterThanOrEqual(12);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/${route === "/app" ? "locker" : "board"}-chart-type${width === 390 ? "-phone" : ""}.png`,
        fullPage: true,
      });
    }
    await page.goto("/board-room?section=files");
    await expect(
      page.getByLabel("Board Room file management", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("region", { name: "Workspace files", exact: true })
      .waitFor();
    await page.screenshot({
      path: `docs/screenshots/board-files-${width === 390 ? "phone" : "desktop"}.png`,
      fullPage: true,
    });
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations;
    expect(violations).toEqual([]);
  }
});
test("members can use Board people and journal but cannot manage files or remove activity", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await signIn(context, "e2e-member");
  await page.goto("/board-room?section=people");
  await expect(
    page.getByRole("heading", { name: "People and invitations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Invite teammate", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".br-desktop-sidebar")
      .getByRole("button", { name: "Files", exact: true }),
  ).toHaveCount(0);
  await page.goto("/board-room?section=activity");
  await expect(
    page.getByRole("heading", { name: "Board Room journal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Select all loaded activities",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    (await page.request.get("/api/attachments/manage?room=board")).status(),
  ).toBe(403);
  expect(
    (
      await page.request.delete("/api/board-room/activity", {
        headers: { origin },
        data: { ids: [crypto.randomUUID()] },
      })
    ).status(),
  ).toBe(403);
});

test("Board journal loads its second page without requesting Locker activity", async ({
  page,
}) => {
  const name = `Paginated journal ${Date.now()}`;
  let p = await project(page.request, name);
  for (let i = 0; i < 26; i++) {
    const response = await page.request.post("/api/board-room", {
      headers: { origin },
      data: {
        action: "progress",
        reason: "Synthetic regression workflow transition.",
        id: p.id,
        version: p.version,
        stage: (i % 2) + 1,
        completed: false,
      },
    });
    expect(response.ok()).toBeTruthy();
    p = (await response.json()).project;
  }
  const lockerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/activity")
      lockerRequests.push(request.url());
  });
  await page.goto("/board-room?section=activity");
  await page
    .getByRole("textbox", { name: "Search activity", exact: true })
    .fill(name);
  await expect(
    page.getByRole("button", {
      name: `Updated progress: ${name}`,
      exact: true,
    }),
  ).toHaveCount(25);
  await page
    .getByRole("button", { name: "Load more updates", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Created project: ${name}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Updated progress: ${name}`,
      exact: true,
    }),
  ).toHaveCount(26);
  expect(lockerRequests).toEqual([]);
});
test("Board settings preserve unsaved edits across sidebar preference updates", async ({
  page,
}) => {
  await page.goto("/board-room?section=preferences");
  const original = (
    await (await page.request.get("/api/workspace/experience")).json()
  ).profile;
  const field = page.getByRole("textbox", { name: "Job title", exact: true });
  const next = `Monitoring ${Date.now()}`;
  await field.fill(next);
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toBeEnabled();
  await expect(field).toHaveValue(next);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/workspace") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save account settings", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  expect(
    (await (await page.request.get("/api/workspace/experience")).json()).profile
      .jobTitle,
  ).toBe(next);
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Collapse navigation", exact: true }),
  ).toBeEnabled();
  await field.fill(original.jobTitle);
  await page
    .getByRole("button", { name: "Save account settings", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/workspace/experience")).json())
          .profile.jobTitle,
    )
    .toBe(original.jobTitle);
});

test("Board settings exports project data and signs out of both rooms", async ({
  page,
  context,
}) => {
  configureTestDatabase("evolve_e2e");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const token = randomUUID();
  await client.connect();
  try {
    await client.query(
      "INSERT INTO auth_session(id,token,user_id,expires_at) VALUES ($1,$2,'e2e-admin',NOW()+INTERVAL '1 day')",
      [randomUUID(), token],
    );
  } finally {
    await client.end();
  }
  const secret =
    process.env.BETTER_AUTH_SECRET ||
    "evolve-browser-tests-only-not-a-production-secret";
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(
        token +
          "." +
          createHmac("sha256", secret).update(token).digest("base64"),
      ),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/board-room?section=preferences");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export projects", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("board-room-projects.csv");
  expect(
    readCSV(await readFile((await file.path())!, "utf8"))[0].slice(0, 3),
  ).toEqual(["Project ID", "Project name", "Primary category"]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  expect((await page.request.get("/api/board-room")).status()).toBe(401);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});
