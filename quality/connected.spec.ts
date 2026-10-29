import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { selectOption } from "../e2e/ui-helpers";
let fixture: { projectId: string; oldProjectId: string; oldTaskId: string };
async function auth(context: BrowserContext, role = "e2e-admin") {
  const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: tokens[role],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(".data/connected-fixture.json", "utf8"));
});
test.beforeEach(async ({ context }) => auth(context));
test("project command centre creates a real canonical project task", async ({
  page,
}, testInfo) => {
  const taskTitle = `${testInfo.project.name || "Chromium"} connected browser task`;
  const before = await (
    await page.request.get("/api/board-room/hub?id=" + fixture.projectId)
  ).json();
  await page.goto("/board-room/projects/" + fixture.projectId);
  await page
    .getByRole("button", { name: "Add project task", exact: true })
    .click();
  await page.getByLabel("Task title", { exact: true }).fill(taskTitle);
  await page.getByLabel("Task title", { exact: true }).press("Control+Enter");
  await expect(page.getByLabel("Task title", { exact: true })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: taskTitle, exact: true }),
  ).toBeVisible();
  const r = await page.request.get(
    "/api/board-room/hub?id=" + fixture.projectId,
  );
  expect((await r.json()).counts.open).toBe(before.counts.open + 1);
  if (!testInfo.project.name) {
    await page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "Project sections" })
        .getByRole("button", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({
        path: `docs/screenshots/connected-project-${width}.png`,
        fullPage: false,
      });
    }
  }
});
test("retired meeting routes are unavailable", async ({ page }) => {
  expect((await page.request.get("/api/board-room/meetings")).status()).toBe(
    404,
  );
  await page.goto("/board-room?section=meetings");
  await expect(
    page.getByRole("heading", { name: "A little off track.", exact: true }),
  ).toBeVisible();
});

test("project documents replace safely and expose private revision downloads", async ({
  page,
}, testInfo) => {
  const originalName = `${testInfo.project.name || "Chromium"} KKP Backbone 500 kV Kalimantan - Signed reference evidence.txt`;
  const revisedName = `${testInfo.project.name || "Chromium"} revised evidence.txt`;
  await page.goto("/board-room/projects/" + fixture.projectId);
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await selectOption(page.getByLabel("Upload document purpose"), "Reference");
  await page.getByLabel("Upload project document").setInputFiles({
    name: originalName,
    mimeType: "text/plain",
    buffer: Buffer.from("Original evidence"),
  });
  await expect(
    page.getByRole("link", {
      name: originalName,
      exact: true,
    }),
  ).toBeVisible();
  if (!testInfo.project.name) {
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/connected-documents-1100.png",
    });
  }
  let lost = false;
  const reservations: string[] = [];
  await page.route("**/api/attachments", async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postDataJSON().replaceDocumentId
    )
      return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    reservations.push(body.id);
    if (!lost) {
      lost = true;
      return route.abort();
    }
    return route.fulfill({ response, json: body });
  });
  await page.getByLabel(`Replace ${originalName}`).setInputFiles({
    name: revisedName,
    mimeType: "text/plain",
    buffer: Buffer.from("Revised evidence"),
  });
  await page
    .getByRole("button", { name: "Retry replacement", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: revisedName, exact: true }),
  ).toBeVisible();
  expect(reservations).toHaveLength(2);
  expect(reservations[0]).toBe(reservations[1]);
  await page.unroute("**/api/attachments");
  await page
    .locator(".br-document")
    .filter({ has: page.getByRole("link", { name: revisedName, exact: true }) })
    .getByRole("button", { name: /Version history/ })
    .click();
  const history = page.getByRole("dialog", { name: /Versions/ });
  await expect(
    history.getByRole("link", { name: "Download version 1", exact: true }),
  ).toBeVisible();
  await expect(
    history.getByRole("link", { name: "Download version 2", exact: true }),
  ).toBeVisible();
  const download = await history
    .getByRole("link", { name: "Download version 1" })
    .getAttribute("href");
  const bytes = await page.request.get(download!);
  expect(await bytes.text()).toBe("Original evidence");
});
test("asset forms recover same-browser drafts and preserve layout at phone and desktop widths", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) =>
      schedule(
        callback,
        delay === 500 ? 10000 : delay,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.goto("/board-room?section=assets");
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("Asset name", { exact: true })
    .fill("Browser recovered asset");
  await d.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(d.getByLabel("Asset name", { exact: true })).toHaveValue(
    "Browser recovered asset",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(
    axe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
});
test("archive retains historical project links and rejects all edits", async ({
  page,
}) => {
  await page.goto("/app?section=project&project=" + fixture.oldProjectId);
  await expect(page).toHaveURL(/\/workspace\/archive\?/);
  await expect(
    page.getByRole("heading", { name: "Legacy Locker archive" }),
  ).toBeVisible();
  expect(
    await page.getByRole("button", { name: /Save|Delete|Create task/ }).count(),
  ).toBe(0);
  const r = await page.request.post("/api/workspace", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "updateTask",
      id: fixture.oldTaskId,
      version: 1,
      patch: { title: "Forbidden archive edit" },
    },
  });
  expect(r.ok()).toBe(false);
});
test("unified search finds project context and asset RUPTL codes", async ({
  page,
}, testInfo) => {
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Search Evolve", exact: true })
    .click();
  const d = page.getByRole("dialog", { name: "Search Evolve", exact: true });
  await d
    .getByLabel("Search projects, assets, tasks and documents")
    .fill("Connected");
  await expect(
    d.getByRole("link", { name: "Connected QA project", exact: true }),
  ).toBeVisible();
  await expect(
    d.getByRole("link", {
      name: `${testInfo.project.name || "Chromium"} connected browser task`,
      exact: true,
    }),
  ).toBeVisible();
});
test("member and unauthenticated boundaries hold for new routes", async ({
  browser,
  page,
}) => {
  const member = await browser.newContext();
  await auth(member, "e2e-member");
  for (const path of ["/api/board-room/quality", "/api/workspace/transition"])
    expect(
      (await member.request.get("http://127.0.0.1:3100" + path)).status(),
    ).toBe(403);
  const denied = await member.request.post(
    "http://127.0.0.1:3100/api/board-room/assets",
    {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        action: "save",
        values: {
          code: "FORBIDDEN",
          name: "Forbidden",
          category: "Pembangkit",
        },
      },
    },
  );
  expect(denied.status()).toBe(403);
  await member.close();
  const anonymous = await browser.newContext();
  for (const path of [
    "/api/workspace/search?q=Connected",
    "/api/workspace/actions",
    "/api/board-room/assets",
    "/api/workspace/archive",
  ])
    expect(
      (await anonymous.request.get("http://127.0.0.1:3100" + path)).status(),
    ).toBe(401);
  await anonymous.close();
  expect(
    (
      await page.request.post("/api/board-room/assets", {
        headers: { Origin: "https://invalid.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});

test("shared views refresh across users and reconnect without replacing unfinished input", async ({
  page,
  browser,
}) => {
  await page.goto(`/board-room/projects/${fixture.projectId}`);
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  const other = await browser.newContext();
  await auth(other, "e2e-member");
  try {
    const title = `Cross-user follow-up ${Date.now()}`;
    const r = await other.request.post("http://127.0.0.1:3100/api/workspace", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        action: "createTask",
        task: { title, projectId: fixture.projectId },
      },
    });
    expect(r.ok()).toBe(true);
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toBeVisible({ timeout: 12000 });
    await page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    const note = page.getByRole("textbox", {
      name: "Progress review note",
      exact: true,
    });
    await note.fill("Keep unfinished evidence during remote changes");
    await page.context().setOffline(true);
    await expect(
      page.getByText("Offline · data may be stale", { exact: true }),
    ).toBeVisible({
      timeout: 15000,
    });
    const changed = await other.request.post(
      "http://127.0.0.1:3100/api/workspace",
      {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {
          action: "createTask",
          task: {
            title: title + " after reconnect",
            projectId: fixture.projectId,
          },
        },
      },
    );
    expect(changed.ok()).toBe(true);
    await page.context().setOffline(false);
    await expect(note).toHaveValue(
      "Keep unfinished evidence during remote changes",
    );
    await page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Tasks", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: title + " after reconnect", exact: true }),
    ).toBeVisible({ timeout: 12000 });
  } finally {
    await page.context().setOffline(false);
    await other.close();
  }
});

test("concurrent asset assignments cannot overwrite a newer project connection", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:3100",
    headers = { origin };
  const create = await page.request.post("/api/board-room/assets", {
    headers,
    data: {
      action: "save",
      values: {
        code: `RACE-${Date.now()}`,
        name: "Assignment race",
        category: "Pembangkit",
        projectId: null,
      },
    },
  });
  expect(create.ok()).toBe(true);
  const { asset } = await create.json();
  const responses = await Promise.all(
    [fixture.projectId, null].map((projectId) =>
      page.request.post("/api/board-room/assets", {
        headers,
        data: {
          action: "assign",
          id: asset.id,
          version: asset.version,
          projectId,
        },
      }),
    ),
  );
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
});

test("asset filters and selected record survive a shareable URL reload", async ({
  page,
}) => {
  const name = `Remembered asset ${Date.now()}`;
  const r = await page.request.post("/api/board-room/assets", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "save",
      values: { code: `CONTEXT-${Date.now()}`, name, category: "Transmisi" },
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/board-room?section=assets");
  const searched = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/board-room/assets" &&
      new URL(r.url()).searchParams.get("q") === name,
  );
  await page.getByLabel("Search assets", { exact: true }).fill(name);
  expect((await (await searched).json()).items).toHaveLength(1);
  await expect(page).toHaveURL(/assetQuery=/);
  const refreshed = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/board-room" &&
      r.request().method() === "GET",
  );
  await page
    .getByRole("button", { name: "Refresh Board Room", exact: true })
    .click();
  await (await refreshed).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      ),
  );
  await expect(page).toHaveURL(/assetQuery=/);

  await page.getByRole("button", { name, exact: true }).click();
  await expect(page).toHaveURL(/asset=/);
  await page.reload();
  await expect(page.getByLabel("Search assets", { exact: true })).toHaveValue(
    name,
  );
  await expect(page.getByLabel("Asset name", { exact: true })).toHaveValue(
    name,
  );
});

test("read-only asset details stay synchronized for another member", async ({
  page,
  browser,
}) => {
  const values = {
    code: `LIVE-${Date.now()}`,
    name: "Live asset detail",
    category: "Gardu Induk",
    capacity: 20,
    unit: "MVA",
    location: "Kalimantan Timur",
    voltage: "150 kV",
    projectId: null,
  };
  const response = await page.request.post("/api/board-room/assets", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "save", values },
  });
  expect(response.ok()).toBe(true);
  const { asset } = await response.json();
  const member = await browser.newContext();
  await auth(member, "e2e-member");
  try {
    const view = await member.newPage();
    await view.goto(
      `http://127.0.0.1:3100/board-room?section=assets&asset=${asset.id}`,
    );
    const d = view.getByRole("dialog");
    await expect(d).toBeVisible();
    await expect(
      d.getByText("Refreshing asset details…", { exact: true }),
    ).toHaveCount(0);
    const updated = await page.request.post("/api/board-room/assets", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        action: "save",
        id: asset.id,
        version: asset.version,
        values: { ...values, name: "Updated live technical record" },
      },
    });
    expect(updated.ok()).toBe(true);
    await expect(
      d.getByText("Updated live technical record", { exact: true }),
    ).toBeVisible({ timeout: 12000 });
  } finally {
    await member.close();
  }
});
