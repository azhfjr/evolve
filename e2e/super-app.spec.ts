import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { createHmac, randomUUID } from "node:crypto";
import { configureTestDatabase } from "../tests/helpers";
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
async function experience(page: Page) {
  const response = await page.request.get("/api/workspace/experience");
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function update(page: Page, command: unknown) {
  const response = await page.request.post("/api/workspace/experience", {
    headers: { origin },
    data: command,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function switcher(page: Page, current: "Locker Room" | "Board Room") {
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .getByRole("button", {
      name: `Switch apps, currently ${current}`,
      exact: true,
    })
    .click();
  return page.getByRole("dialog", {
    name: "Your workspace, two perspectives.",
  });
}
test.describe.serial("Evolve super-app integration", () => {
  test("one authenticated entry offers both rooms, real totals, and round-trip app switching", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/");
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(
      page.getByRole("heading", { name: "Make room for what’s next." }),
    ).toBeVisible();
    const snapshot = await experience(page);
    expect(snapshot.totals).toEqual({
      tasks: expect.any(Number),
      lockerProjects: expect.any(Number),
      boardProjects: expect.any(Number),
    });
    expect(
      (await page.request.get("/api/workspace/experience")).headers()[
        "cache-control"
      ],
    ).toContain("no-store");
    await page.locator(".locker-card").click();
    await expect(page).toHaveURL(/\/app/);
    const dialog = await switcher(page, "Locker Room");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: /Board Room/ }).click();
    await expect(page).toHaveURL(/\/board-room/);
    await expect(
      page.getByRole("heading", {
        name: "Kalimantan - Power System Projects",
        exact: true,
      }),
    ).toBeVisible();
    await (
      await switcher(page, "Board Room")
    )
      .getByRole("link", { name: /Locker Room/ })
      .click();
    await expect(page).toHaveURL(/\/app/);
    await (
      await switcher(page, "Locker Room")
    )
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(page).toHaveURL(/\/workspace$/);
  });
  test("shared appearance saves once and follows both rooms, with stale-update protection", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/workspace/settings?tab=appearance");
    const original = await experience(page);
    try {
      await expect(
        page.getByRole("tab", { name: "Appearance", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.getByRole("radio", { name: "Dark", exact: true }).check();
      await selectOption(
        page.getByRole("combobox", { name: "Display density", exact: true }),
        { value: "compact" },
      );
      await page.getByRole("checkbox", { name: /Reduce.*motion/ }).check();
      await page
        .getByRole("button", { name: "Save account settings", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const saved = await experience(page);
      expect(saved.profile.preferences.density).toBe("compact");
      const { version, ...fields } = saved.settings;
      await update(page, {
        action: "updateWorkspace",
        version,
        ...fields,
        accent: "blue",
      });
      for (const [path, root] of [
        ["/board-room", ".br"],
        ["/app", ".app-shell"],
        ["/workspace", ".super-app"],
      ]) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark",
        );
        await expect(page.locator(root)).toHaveAttribute("data-accent", "blue");
        await expect(page.locator(root)).toHaveAttribute(
          "data-density",
          "compact",
        );
        await expect(page.locator(root)).toHaveAttribute(
          "data-reduce-motion",
          "true",
        );
      }
      const stale = await page.request.post("/api/workspace/experience", {
        headers: { origin },
        data: { action: "updateProfile", ...original.profile },
      });
      expect(stale.status()).toBe(409);
    } finally {
      const current = await experience(page);
      await update(page, {
        action: "updateProfile",
        ...original.profile,
        version: current.profile.version,
      });
      await update(page, {
        action: "updateWorkspace",
        ...original.settings,
        version: current.settings.version,
      });
    }
  });
  test("template directory provides real downloads and a durable stage-settings deep link", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/workspace/templates");
    await expect(
      page.getByRole("heading", { name: "Task templates", exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download CSV template", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      "project-upload-template.csv",
    );
    const template = await page.request.get(
      "/board-room/project-upload-template.csv",
    );
    expect(await template.text()).toContain(
      "Project ID,Project name,Primary category",
    );
    await page
      .getByRole("link", { name: "Configure project stages", exact: true })
      .click();
    await expect(page.locator(".br-topbar")).toContainText("Stage settings");
    await page.reload();
    await expect(page.locator(".br-topbar")).toContainText("Stage settings");
    await expect(
      page.getByRole("button", {
        name: "Open Board Room settings",
        exact: true,
      }),
    ).toBeVisible();
  });
  test("room switches protect unfinished Locker Room task edits", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/app");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByLabel("Task title", { exact: true })
      .fill("Protected across room switches");
    await (
      await switcher(page, "Locker Room")
    )
      .getByRole("link", { name: /Board Room/ })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: "Discard unsaved changes?",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
      "Protected across room switches",
    );
    await (
      await switcher(page, "Locker Room")
    )
      .getByRole("link", { name: /Board Room/ })
      .click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(page).toHaveURL(/\/board-room/);
  });
  test("chooser, settings and switcher support responsive layouts, keyboard and light/dark accessibility", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/workspace");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await expect(page.locator(".locker-card")).toBeVisible();
      await expect(page.locator(".board-card")).toBeVisible();
      await page.screenshot({
        path: `test-results/super-app-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const scan = await new AxeBuilder({ page })
        .include(".super-app")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(scan.violations).toEqual([]);
    }
    await page.goto("/board-room");
    const dialog = await switcher(page, "Board Room");
    await expect(dialog).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include(".room-switch-dialog")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Switch apps, currently Board Room",
        exact: true,
      }),
    ).toBeFocused();
  });
  test("shared routes enforce invitations, roles, origin checks and settings-only commands", async ({
    page,
    context,
  }) => {
    for (const role of ["e2e-outsider", "e2e-unverified"]) {
      await context.clearCookies();
      await signIn(context, role);
      expect(
        (await page.request.get("/api/workspace/experience")).status(),
      ).toBe(403);
      await page.goto("/workspace");
      await expect(page.locator(".room-home-card")).toHaveCount(0);
    }
    await context.clearCookies();
    await signIn(context, "e2e-member");
    const data = await experience(page);
    expect(
      (
        await page.request.post("/api/workspace/experience", {
          headers: { origin },
          data: {
            action: "updateWorkspace",
            ...data.settings,
            name: "Unauthorized branding",
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/workspace/experience", {
          headers: { origin: "https://wrong.example" },
          data: { action: "updateProfile", ...data.profile },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/workspace/experience", {
          headers: { origin },
          data: { action: "createTask", task: { title: "Wrong endpoint" } },
        })
      ).status(),
    ).toBe(400);
    await page.goto("/workspace/settings");
    await expect(
      page.getByRole("tab", { name: "Workspace", exact: true }),
    ).toHaveCount(0);
    await context.clearCookies();
    expect((await page.request.get("/api/workspace/experience")).status()).toBe(
      401,
    );
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/$/);
  });
  test("one sign-out revokes access to both apps", async ({
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
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get("/api/workspace")).status()).toBe(401);
    expect((await page.request.get("/api/board-room")).status()).toBe(401);
    expect((await page.request.get("/api/workspace/experience")).status()).toBe(
      401,
    );
  });
});

test("mobile room switcher owns Escape without closing Locker Room navigation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Switch apps, currently Locker Room",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your workspace, two perspectives.",
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
  await expect(
    page.getByRole("button", {
      name: "Switch apps, currently Locker Room",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("button", {
      name: "Switch apps, currently Locker Room",
      exact: true,
    })
    .click();
  await dialog.getByRole("link", { name: /Board Room/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Kalimantan - Power System Projects",
      exact: true,
    }),
  ).toBeVisible();
});

test("Google sign-in requests the shared chooser with the existing provider", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/api/auth/sign-in/social", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      provider: "google",
      callbackURL: "/workspace",
    });
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "Test sign-in request captured" }),
    });
  });
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(
    page.locator(".sign-in-control").getByRole("alert"),
  ).toContainText("Test sign-in request captured");
});
