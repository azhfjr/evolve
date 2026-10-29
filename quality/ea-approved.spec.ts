import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
async function auth(context: BrowserContext) {
  const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: tokens["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.beforeEach(async ({ context }) => auth(context));
for (const kind of ["asset", "project", "task"])
  test(`${kind} draft cannot return after another tab signs out`, async ({
    page,
    context,
  }) => {
    const config =
      kind === "asset"
        ? ["/board-room?section=assets", "Add asset", "Asset name"]
        : kind === "project"
          ? ["/board-room?section=projects", "Add project", "Project name"]
          : ["/app?section=tasks", "New task", "Task title"];
    await page.goto(config[0]);
    await page.getByRole("button", { name: config[1], exact: true }).click();
    const input = page.getByLabel(config[2], { exact: true });
    await input.fill("Private audit draft");
    await page.waitForTimeout(700);
    const other = await context.newPage();
    await other.goto("/workspace");
    await other.route("**/api/auth/sign-out", async (route) => {
      await context.clearCookies({ name: "better-auth.session_token" });
      await route.fulfill({ json: { success: true } });
    });
    await other.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(other).toHaveURL("http://127.0.0.1:3100/");
    await input.evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide")),
    );
    await page.waitForTimeout(700);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter(
          (k) =>
            k.startsWith("evolve-form-draft-v1:") ||
            k.startsWith("evolve-task-draft-"),
        ),
      ),
    ).toEqual([]);
    await expect(
      page.getByText(/You signed out\. Reload and sign in/).first(),
    ).toBeVisible();
    await expect(input.locator("xpath=ancestor::form[1]")).toHaveAttribute(
      "inert",
      "",
    );
  });
async function openPicker(page: import("@playwright/test").Page) {
  const a = {
    id: "11111111-1111-4111-8111-111111111111",
    code: "AUDIT-ONE",
    name: "First asset",
    category: "Pembangkit",
    capacity: 1,
    unit: "MW",
    location: "Kalimantan Timur",
    voltage: "150 kV",
    projectId: null,
    projectName: null,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const b = {
    ...a,
    id: "22222222-2222-4222-8222-222222222222",
    code: "AUDIT-TWO",
    name: "Second asset",
  };
  await page.route("**/api/board-room/assets/selection*", (route) =>
    route.fulfill({
      json: { items: route.request().method() === "POST" ? [a] : [] },
    }),
  );
  await page.route("**/api/board-room/assets?*", (route) =>
    route.fulfill({
      json: {
        items: new URL(route.request().url()).searchParams.get("q") ? [b] : [a],
        total: 1,
        page: 1,
      },
    }),
  );
  await page.goto("/board-room?section=projects");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: /selected assets/ }).click();
  return d;
}
test("selected asset codes survive search changes and recovered project drafts", async ({
  page,
}) => {
  let d = await openPicker(page);
  await d
    .locator(".connected-picker-menu input[type=checkbox]")
    .first()
    .check();
  await d
    .getByRole("textbox", { name: "Search project assets" })
    .fill("second");
  await expect(d.getByText("AUDIT-TWO — Second asset")).toBeVisible();
  await expect(
    d.getByRole("button", { name: "Remove asset AUDIT-ONE", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Remove asset AUDIT-ONE", exact: true }),
  ).toBeVisible();
});
test("asset menu Escape returns focus without dismissing the project form", async ({
  page,
}) => {
  const d = await openPicker(page);
  await expect(
    d.getByRole("textbox", { name: "Search project assets" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(d.locator(".connected-picker-menu")).toHaveCount(0);
  await expect(
    d.getByRole("button", { name: /selected assets/ }),
  ).toBeFocused();
  await expect(d.getByLabel("Project name", { exact: true })).toBeVisible();
});
test("Copy ID handles denied clipboard and provides a manual fallback", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    }),
  );
  await page.goto("/board-room/projects/" + fixture.projectId);
  await page.getByRole("button", { name: "Copy ID", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /copy.*manually/i }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.getByLabel("Project ID to copy")).toHaveValue(
    fixture.projectId,
  );
});
test("project badges and asset guide satisfy contrast and target checks in both themes", async ({
  page,
}) => {
  for (const route of [
    "/board-room?section=projects",
    "/board-room?section=assets",
  ])
    for (const theme of ["light", "dark"]) {
      await page.goto(route);
      await page.locator(".room-loading").waitFor({ state: "hidden" });
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      const a = await new AxeBuilder({ page })
        .withRules(["color-contrast", "target-size"])
        .analyze();
      expect(a.violations).toEqual([]);
    }
});
test("hub discloses bounded previews and opens the full project asset scope", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  await page.route("**/api/board-room/hub?*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        ...data,
        assetCount: 1000,
        counts: { ...data.counts, total: 1000 },
      },
    });
  });
  await page.goto(
    "/board-room/projects/" + fixture.projectId + "?projectTab=assets",
  );
  await expect(
    page.getByText(/Showing \d+ of 1,000 linked assets/),
  ).toBeVisible();
  const all = page.getByRole("link", {
    name: "View all project assets",
    exact: true,
  });
  await all.click();
  await expect(page).toHaveURL(new RegExp("assetProject=" + fixture.projectId));
});
test("action centre has independent pagination with correct complete totals", async ({
  page,
}) => {
  await page.route("**/api/workspace/actions*", (route) => {
    const p = Number(
      new URL(route.request().url()).searchParams.get("tasksPage") || 1,
    );
    return route.fulfill({
      json: {
        tasks: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Task page " + p,
            projectName: "Project",
            dueDate: null,
            overdue: false,
          },
        ],
        notifications: [],
        review: [],
        pagination: {
          tasks: { page: p, limit: 100, total: 101 },
          notifications: { page: 1, limit: 100, total: 0 },
          review: { page: 1, limit: 50, total: 0 },
        },
      },
    });
  });
  await page.goto("/workspace");
  const panel = page
    .getByRole("heading", { name: "Your action centre" })
    .locator("..")
    .locator("..");
  await expect(panel.getByText(/of 101/)).toBeVisible();
  await panel
    .getByRole("button", { name: "Next actions", exact: true })
    .click();
  await expect(
    panel.getByRole("link", { name: "Task page 2", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tasksPage=2/);
  await page.reload();
  await expect(
    panel.getByRole("link", { name: "Task page 2", exact: true }),
  ).toBeVisible();
});

test("selection hydration respects membership and validates bounded IDs", async ({
  page,
  context,
}) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  const created = await page.request.post("/api/board-room/assets", {
    headers,
    data: {
      action: "save",
      values: {
        code: "HYDRATE-" + Date.now(),
        name: "Hydrated asset",
        category: "Pembangkit",
      },
    },
  });
  expect(created.ok()).toBe(true);
  const asset = (await created.json()).asset;
  const selected = await page.request.post("/api/board-room/assets/selection", {
    headers,
    data: { ids: [asset.id, asset.id] },
  });
  expect(selected.ok()).toBe(true);
  expect((await selected.json()).items).toEqual([
    { id: asset.id, code: asset.code, name: "Hydrated asset" },
  ]);
  expect(
    (
      await page.request.post("/api/board-room/assets/selection", {
        headers,
        data: { ids: ["bad-id"] },
      })
    ).status(),
  ).toBe(400);
  await context.clearCookies({ name: "better-auth.session_token" });
  expect(
    (
      await page.request.post("/api/board-room/assets/selection", {
        headers,
        data: { ids: [asset.id] },
      })
    ).status(),
  ).toBe(401);
});

test("reopened editors stay invalidated after cross-tab logout", async ({
  page,
  context,
}) => {
  await page.goto("/board-room?section=assets");
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Asset name", { exact: true })
    .fill("Before logout");
  const other = await context.newPage();
  await other.goto("/workspace");
  await other.route("**/api/auth/sign-out", async (route) => {
    await context.clearCookies({ name: "better-auth.session_token" });
    await route.fulfill({ json: { success: true } });
  });
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(other).toHaveURL("http://127.0.0.1:3100/");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  const input = page
    .getByRole("dialog")
    .getByLabel("Asset name", { exact: true });
  await input.evaluate((el) => {
    (el as HTMLInputElement).value = "Reopened stale draft";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(700);
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
  await expect(input.locator("xpath=ancestor::form[1]")).toHaveAttribute(
    "inert",
    "",
  );
});
test("unavailable recovered assets have an actionable removal state", async ({
  page,
}) => {
  let d = await openPicker(page);
  await d
    .locator(".connected-picker-menu input[type=checkbox]")
    .first()
    .check();
  await expect(
    d.getByRole("button", { name: "Remove asset AUDIT-ONE", exact: true }),
  ).toBeVisible();
  await page.route("**/api/board-room/assets/selection*", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/board-room/assets?*", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1 } }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(d.getByText(/Selected assets are unavailable/)).toBeVisible();
  await d
    .getByRole("button", {
      name: "Remove unavailable asset 11111111-1111-4111-8111-111111111111",
      exact: true,
    })
    .click();
  await expect(
    d.getByRole("button", { name: /0 selected assets/ }),
  ).toBeVisible();
  await expect(d.getByText(/Selected assets are unavailable/)).toHaveCount(0);
});

test("approved asset controls reflow at six widths in both themes and large fonts", async ({
  page,
}, info) => {
  const d = await openPicker(page);
  await d
    .locator(".connected-picker-menu input[type=checkbox]")
    .first()
    .check();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(300);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document
          .querySelectorAll(".br,.br-modal")
          .forEach((el) => el.setAttribute("data-font-scale", "large"));
      }, theme);
      expect(
        (await d
          .locator(".connected-picker-menu input[type=checkbox]")
          .first()
          .boundingBox())!.width,
      ).toBeLessThanOrEqual(24);
      const row = d.locator(".connected-asset-option").first();
      const checkbox = (await row.locator("input").boundingBox())!,
        label = (await row.locator("span").boundingBox())!;
      expect(label.x).toBeGreaterThanOrEqual(checkbox.x + checkbox.width + 6);
      expect(
        await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `${width} ${theme} dialog overflow`,
      ).toBe(true);
      await expect(
        d.getByRole("button", { name: "Remove asset AUDIT-ONE", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`picker-${width}-${theme}.png`),
      });
    }
  }
});
