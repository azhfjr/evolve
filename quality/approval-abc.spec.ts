import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
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
test.beforeEach(async ({ context }) => auth(context));
test("template navigation keeps incomplete browser drafts and offers explicit discard", async ({
  page,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Unfinished field");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Leave unsaved project template?",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Unfinished field");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("button", { name: "Leave and keep browser draft", exact: true })
    .click();
  await expect(page).toHaveURL(/section=overview/);
  await page.goBack();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Unfinished field");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("button", { name: "Discard and leave", exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Add custom field", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true }),
  ).toHaveCount(0);
});
test("template reload recovers edits without silently saving to the server", async ({
  page,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Reload recovery");
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Reload recovery");
  const server = await (
    await page.request.get("/api/board-room/project-template?manage=1")
  ).json();
  expect(JSON.stringify(server.draft)).not.toContain("Reload recovery");
});
test("notification failure is visible and retriable without unhandled errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let attempts = 0,
    read = false;
  await page.route("**/api/workspace/actions", (r) =>
    r.fulfill({
      json: {
        tasks: [],
        review: [],
        notifications: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            taskId: null,
            message: "Audit notification",
            read,
          },
        ],
      },
    }),
  );
  await page.route("**/api/workspace", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    attempts++;
    if (attempts === 1)
      return r.fulfill({
        status: 503,
        json: { error: "Notification temporarily unavailable" },
      });
    read = true;
    await r.fulfill({ json: { ok: true } });
  });
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Notification temporarily unavailable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry mark read", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(attempts).toBe(2);
});

test("purpose labels preserve routes and describe the current CSV contract", async ({
  page,
}) => {
  await page.goto("/board-room?section=templates");
  await expect(
    page.getByRole("heading", {
      name: "Import & Workflow Guides",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/merge projects by Project ID/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Geographic Map", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Project–Asset Connections", exact: true })
      .first(),
  ).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Project Fields", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Project Fields", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/section=project-template/);
  await expect(
    page.getByRole("heading", { name: "Project Template", exact: true }),
  ).toBeVisible();
  await page.goto("/app?section=templates");
  await expect(
    page.getByRole("button", { name: "Task Templates", exact: true }).first(),
  ).toBeAttached();
  await page.goto("/workspace/templates");
  await expect(
    page.getByRole("link", { name: "Template Library", exact: true }),
  ).toBeVisible();
});

test("blocked template storage never claims recovery and explicit discard still works", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes(":project-template:"))
        throw new DOMException("Storage blocked", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Keep this input");
  await expect(
    page.getByText("Draft recovery unavailable. Keep this page open.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Leave unsaved project template?",
  });
  await dialog
    .getByRole("button", { name: "Leave and keep browser draft", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("could not be saved");
  await expect(
    dialog.getByRole("button", {
      name: "Leave and keep browser draft",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Keep this input");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("button", { name: "Discard and leave", exact: true })
    .click();
  await expect(page).toHaveURL(/section=overview/);
});
test("template recovery keeps base version and server rejects conflicting saves", async ({
  page,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Stable field key", exact: true })
    .fill("recovery_plan");
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Version conflict draft");
  await page
    .getByRole("textbox", { name: "Option 1", exact: true })
    .fill("Original option");
  const endpoint = "/api/board-room/project-template?manage=1";
  const before = await (await page.request.get(endpoint)).json();
  const remote = await page.request.post("/api/board-room/project-template", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveDraft",
      version: before.version,
      definition: before.draft,
    },
  });
  expect(remote.ok()).toBeTruthy();
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save template draft", exact: true })
    .click();
  await expect(page.locator(".template-manager .br-error")).toContainText(
    /changed|conflict/i,
  );
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Version conflict draft");
  const after = await (await page.request.get(endpoint)).json();
  expect(after.draft).toEqual(before.draft);
});
test("ordinary links are guarded and successful logout clears active template drafts", async ({
  page,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Account private draft");
  await page.locator("a.br-brand").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Leave unsaved project template?",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await page.route("**/api/auth/sign-out", async (r) => {
    await page.context().clearCookies({ name: "better-auth.session_token" });
    await r.fulfill({ json: { success: true } });
  });
  await page
    .getByRole("button", {
      name: "Workspace Admin · Workspace admin",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("evolve-form-draft-v1:"),
      ),
    ),
  ).toEqual([]);
});

test("affected template and guard layouts stay accessible at six widths", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill(
      "Long project field label that should wrap naturally without clipping",
    );
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.querySelector(".br")?.setAttribute("data-font-scale", "large");
      }, theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}/${theme}`,
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`template-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Leave unsaved project template?",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Keep editing", exact: true }),
  ).toBeFocused();
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`guard-${width}.png`) });
  }
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    a11y.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("blocked storage Back navigation preserves the editor until explicit discard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes(":project-template:"))
        throw new DOMException("Blocked", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await page.goto("/board-room?section=overview");
  await page
    .getByRole("button", { name: "Project Fields", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("History must preserve this");
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("dialog", {
    name: "Leave unsaved project template?",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page).toHaveURL(/section=project-template/);
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("History must preserve this");
  await page.evaluate(() => history.back());
  await dialog
    .getByRole("button", { name: "Discard and leave", exact: true })
    .click();
  await expect(page).toHaveURL(/section=overview/);
});
test("active Project Fields navigation cannot release future draft protection", async ({
  page,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("First input");
  await page
    .getByRole("button", { name: "Project Fields", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Leave unsaved project template?" }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Latest input");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Leave and keep browser draft", exact: true })
    .click();
  await page.goBack();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Latest input");
});
test("logout in another tab invalidates pending template persistence", async ({
  page,
  context,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Private two-tab input");
  const other = await context.newPage();
  await other.goto("/workspace");
  await other.route("**/api/auth/sign-out", async (r) => {
    await context.clearCookies({ name: "better-auth.session_token" });
    await r.fulfill({ json: { success: true } });
  });
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(other).toHaveURL("http://127.0.0.1:3100/");
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("evolve-form-draft-v1:"),
      ),
    ),
  ).toEqual([]);
  await other.close();
});

test("blocked storage Forward navigation preserves the editor until explicit discard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes(":project-template:"))
        throw new DOMException("Blocked", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  await page.goBack();
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Forward input");
  await page.evaluate(() => history.forward());
  const dialog = page.getByRole("dialog", {
    name: "Leave unsaved project template?",
  });
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Field label", exact: true }),
  ).toHaveValue("Forward input");
  await page.evaluate(() => history.forward());
  await dialog
    .getByRole("button", { name: "Discard and leave", exact: true })
    .click();
  await expect(page).toHaveURL(/section=overview/);
});
test("gateway template failure displays actionable retry instead of parser output", async ({
  page,
}) => {
  await page.route("**/api/board-room/project-template?manage=1", (r) =>
    r.fulfill({
      status: 503,
      contentType: "text/html",
      body: "<html>Service unavailable</html>",
    }),
  );
  await page.goto("/board-room?section=project-template");
  const error = page.locator(".br-panel p[role=alert]");
  await expect(error).toContainText("temporarily unavailable");
  await expect(error).not.toContainText(/Unexpected|JSON|<html>/);
  await expect(
    error.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
});
test("notification pending state prevents duplicate clicks without blocking another item", async ({
  page,
}) => {
  let calls = 0;
  const readIds = new Set<string>();
  let release: (() => void) | undefined;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workspace/actions", (r) =>
    r.fulfill({
      json: {
        tasks: [],
        review: [],
        notifications: ["one", "two"].map((id) => ({
          id,
          taskId: null,
          message: "Notification " + id,
          read: readIds.has(id),
        })),
      },
    }),
  );
  await page.route("**/api/workspace", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    calls++;
    if (r.request().postDataJSON().id === "one") await first;
    readIds.add(r.request().postDataJSON().id);
    await r.fulfill({ json: { ok: true } });
  });
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  const one = page
    .locator(".connected-issues li")
    .filter({ hasText: "Notification one" });
  const two = page
    .locator(".connected-issues li")
    .filter({ hasText: "Notification two" });
  await one.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    one.getByRole("button", { name: "Marking read…", exact: true }),
  ).toBeDisabled();
  await two.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  release!();
  await expect(
    one.getByText("Notification marked read.", { exact: true }),
  ).toBeVisible();
});

test("notification controls follow fresh unread state after a successful mark read", async ({
  page,
}) => {
  let read = false;
  await page.route("**/api/workspace/actions", (r) =>
    r.fulfill({
      json: {
        tasks: [],
        review: [],
        notifications: [
          {
            id: "fresh-notification",
            taskId: null,
            message: "Fresh notification",
            read,
          },
        ],
      },
    }),
  );
  await page.route("**/api/workspace", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    read = true;
    await r.fulfill({ json: { ok: true } });
  });
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toHaveCount(0);
  read = false;
  await page.evaluate(() => window.dispatchEvent(new Event("evolve:changed")));
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toBeVisible();
});
