import { PROJECT_FIELDS } from "../src/lib/connected/project-fields";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ context }) => {
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
});
test("both rooms use matching body type, logo styling and Home navigation", async ({
  page,
}) => {
  const samples = [];
  for (const route of ["/app", "/board-room"]) {
    await page.goto(route);
    const sidebar = page.locator(
      route === "/app" ? ".sidebar" : ".br-desktop-sidebar",
    );
    await expect(sidebar.locator(".workspace-picker")).toHaveCount(0);
    samples.push(
      await sidebar.evaluate((el) => {
        const root = el.closest(".app-shell,.br")!;
        const logo = el.querySelector(".brand-word strong")!;
        const mark = el.querySelector(".brand-mark")!;
        return {
          body: getComputedStyle(root).fontSize,
          font: getComputedStyle(root).fontFamily,
          logoSize: getComputedStyle(logo).fontSize,
          logoColor: getComputedStyle(logo).color,
          markWidth: getComputedStyle(mark).width,
          themeSize: getComputedStyle(
            el.querySelector('[data-sidebar-label="Theme"]')!,
          ).fontSize,
          profileSize: getComputedStyle(
            el.querySelector(".profile-button strong")!,
          ).fontSize,
        };
      }),
    );
    await expect(
      sidebar.getByRole("button", { name: "Home", exact: true }),
    ).toBeVisible();
  }
  expect(samples[1]).toEqual(samples[0]);
});
test("dark Board Room highlighted cards and controls do not flash white", async ({
  page,
}) => {
  const current = await (
    await page.request.get("/api/workspace/experience")
  ).json();
  const { version, ...fields } = current.profile;
  await page.request.post("/api/workspace/experience", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "updateProfile",
      version,
      ...fields,
      preferences: { ...fields.preferences, theme: "dark" },
    },
  });
  try {
    await page.goto("/board-room");
    for (const selector of [
      ".br-title-row button:not(.br-primary)",
      ".br-year",
      ".br-stage-counts > button",
      ".br-view-switch button",
      ".br-sidebar .nav-item",
    ]) {
      const item = page.locator(selector).first();
      await item.hover();
      await item.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      );
      const c = await item.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      const numbers = c.match(/[\d.]+/g)!.map(Number);
      expect(
        numbers.slice(0, 3).every((v) => v > 200),
        `${selector}: ${c}`,
      ).toBe(false);
    }
  } finally {
    const now = await (
      await page.request.get("/api/workspace/experience")
    ).json();
    await page.request.post("/api/workspace/experience", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        action: "updateProfile",
        ...now.profile,
        preferences: current.profile.preferences,
      },
    });
  }
});
test("dark active project stages meet text contrast with the shared accent", async ({
  page,
}) => {
  const initial = await (
    await page.request.get("/api/workspace/experience")
  ).json();
  async function theme(theme: string) {
    const d = await (
      await page.request.get("/api/workspace/experience")
    ).json();
    const r = await page.request.post("/api/workspace/experience", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        action: "updateProfile",
        ...d.profile,
        preferences: { ...d.profile.preferences, theme },
      },
    });
    expect(r.ok()).toBeTruthy();
  }
  try {
    await theme("dark");
    const response = await page.request.post("/api/board-room", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        action: "saveProject",
        values: {
          externalId: "DESIGN-ACTIVE-STAGE",
          name: "Active stage contrast",
        },
      },
    });
    expect(response.ok()).toBeTruthy();
    const { project } = await response.json();
    await page.request.post("/api/board-room", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        action: "progress",
        reason: "Synthetic regression workflow transition.",
        id: project.id,
        version: project.version,
        stage: 4,
        completed: false,
      },
    });
    await page.goto(`/board-room/projects/${project.id}`);
    const stage = page.locator(".br-modal .br-stage-track .current");
    await expect(stage).toBeVisible();
    const contrast = await stage.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      function luminance(color: string) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const bytes = ctx.getImageData(0, 0, 1, 1).data;
        const rgb = [...bytes].slice(0, 3).map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      }
      const style = getComputedStyle(el);
      const a = luminance(style.color),
        b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => {
      (window as unknown as { projectDocument: boolean }).projectDocument =
        true;
    });
    await page
      .getByRole("link", {
        name: "Open this project’s shareable page",
        exact: true,
      })
      .click();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { projectDocument: boolean }).projectDocument,
      ),
    ).toBe(true);
  } finally {
    await theme(initial.profile.preferences.theme);
  }
});
test("the project database and import dialog expose the synchronized CSV guide", async ({
  page,
}) => {
  await page.goto("/board-room?section=database");
  await page
    .getByText(`Project CSV column guide (${PROJECT_FIELDS.length} fields)`, {
      exact: true,
    })
    .click();
  const guide = page.locator(".br-csv-guide");
  await expect(guide.getByRole("rowheader")).toHaveCount(PROJECT_FIELDS.length);
  await expect(
    guide.getByRole("rowheader", { name: "Completed", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose project CSV", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import project CSV",
    exact: true,
  });
  await dialog
    .getByText(`Project CSV column guide (${PROJECT_FIELDS.length} fields)`, {
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("rowheader", { name: "Project link labels", exact: true }),
  ).toBeVisible();
});
test("theme changes keep highlighted Home colors atomic", async ({ page }) => {
  await page.goto("/workspace");
  const home = page
    .locator(".super-header")
    .getByRole("link", { name: "Home", exact: true });
  const properties = await home.evaluate((el) =>
    getComputedStyle(el)
      .transitionProperty.split(",")
      .map((v) => v.trim()),
  );
  expect(properties).not.toContain("background-color");
  expect(properties).not.toContain("color");
  expect(properties).not.toContain("all");
});
