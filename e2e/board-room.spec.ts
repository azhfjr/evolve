import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://127.0.0.1:3100";
async function signIn(context: BrowserContext, who = "e2e-admin") {
  const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth[who],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function command(page: Page, data: unknown) {
  const r = await page.request.post("/api/board-room", {
    headers: { origin },
    data,
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
let projectId: string;
test.describe.serial("Board Room production workflows", () => {
  test("authenticated admin creates durable projects through the native form and API", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/board-room");
    await expect(
      page.getByRole("heading", {
        name: "Kalimantan - Power System Projects",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add project", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Project name", { exact: true })
      .fill("Kalimantan solar project");
    await selectOption(
      dialog.getByLabel("Primary category", { exact: true }),
      "Pembangkit",
    );
    await dialog.getByLabel("Capacity", { exact: true }).fill("100");
    await dialog.getByLabel("Capacity unit", { exact: true }).fill("MWp");
    await dialog.getByLabel("Start year", { exact: true }).fill("2026");
    await selectOption(
      dialog.getByLabel("Planned COD year", { exact: true }),
      "2030",
    );
    await dialog
      .getByLabel("Project links")
      .fill(
        "Project charter | https://example.com/charter\nTechnical report | https://example.com/report",
      );
    await dialog
      .getByRole("button", { name: /^(Save|Create) project$/, exact: true })
      .click();
    await dialog
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await expect(
      dialog.getByRole("link", { name: "Project charter", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Technical report", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    const snapshot = await (await page.request.get("/api/board-room")).json();
    expect(
      snapshot.projects.find(
        (p: { name: string }) => p.name === "Kalimantan solar project",
      ).location,
    ).toBe("");
    projectId = snapshot.projects.find(
      (p: { name: string }) => p.name === "Kalimantan solar project",
    ).id;
    for (const [externalId, name, category] of [
      ["KAL-TRANS-01", "Kalimantan transmission project", "Transmisi"],
      ["KAL-GI-01", "Kalimantan substation project", "Gardu Induk"],
    ])
      await command(page, {
        action: "saveProject",
        values: { externalId, name, category, startYear: 2027, codYear: 2030 },
      });
    await page.reload();
    await expect(page.locator(".br-project-row")).toHaveCount(3);
    await expect(page.locator(".br-time-header button").first()).toHaveText(
      "2026",
    );
    const card = page.getByRole("button", {
      name: "2030: 3 projects",
      exact: true,
    });
    for (const label of ["Pembangkit", "Transmisi", "Gardu Induk"])
      await expect(
        card
          .locator(".br-year-categories>div")
          .filter({ hasText: label })
          .locator("b"),
      ).toHaveText("1");
    const aligned = await card
      .locator(".br-year-categories>div b")
      .evaluateAll((cells) =>
        cells.every(
          (c) =>
            Math.abs(
              c.getBoundingClientRect().right -
                cells[0].getBoundingClientRect().right,
            ) < 0.5,
        ),
      );
    expect(aligned).toBeTruthy();
    await page.screenshot({
      path: "test-results/board-room-desktop.png",
      fullPage: true,
    });
  });
  test("progress, Undo in open details, private uploads and explicit validation survive reload", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto(`/board-room/projects/${projectId}`);
    let dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: "Kalimantan solar project",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", {
        name: "Set Kalimantan solar project to stage 4: Stage 4",
        exact: true,
      })
      .click();
    await dialog
      .getByRole("textbox", { name: "Reason for stage jump", exact: true })
      .fill("Confirmed the project baseline.");
    await dialog
      .getByRole("button", { name: "Apply stage change", exact: true })
      .click();
    await expect(dialog.locator(".br-stage-track button").nth(3)).toHaveClass(
      "current",
    );
    await dialog
      .getByRole("button", { name: "Undo progress", exact: true })
      .click();
    await expect(dialog.locator(".br-track-foot")).toContainText("Not started");
    await dialog
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await selectOption(
      dialog.getByLabel("Upload document purpose"),
      "Reference",
    );
    await dialog.getByLabel("Upload project document").setInputFiles({
      name: "board-review.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Project review document for isolated browser test"),
    });
    await expect(
      dialog.getByRole("link", { name: "board-review.txt", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Mark project valid", exact: true }),
    ).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Mark project valid", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Revoke validity", exact: true }),
    ).toBeVisible();
    await page.reload();
    dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Revoke validity", exact: true }),
    ).toBeVisible();
    await selectOption(
      dialog.getByLabel("Upload document purpose"),
      "Reference",
    );
    await dialog.getByLabel("Upload project document").setInputFiles({
      name: "board-update.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Updated project document"),
    });
    await expect(
      dialog.getByRole("button", { name: "Mark project valid", exact: true }),
    ).toBeVisible();
    await expect(dialog.locator(".br-status").first()).toContainText(
      "Needs review",
    );
  });
  test("CSV column mapping previews exact changes, merges and preserves repeated imports", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/board-room");
    await page
      .getByRole("button", { name: "Import projects", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: /Legacy CSV mode/ }).check();
    await dialog.locator("input[type=file]").setInputFiles({
      name: "projects.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Ref,Project,Kind,COD,Work,Level\nCSV-BOARD-01,Imported Board project,Transmisi,2032,Line extension,150 kV\n",
      ),
    });
    await selectOption(
      dialog.getByLabel("Map RUPTL Code", { exact: true }),
      "Ref",
    );
    await selectOption(
      dialog.getByLabel("Map Project name", { exact: true }),
      "Project",
    );
    await selectOption(
      dialog.getByLabel("Map Primary category", { exact: true }),
      "Kind",
    );
    await selectOption(
      dialog.getByLabel("Map Planned COD year", { exact: true }),
      "COD",
    );
    await selectOption(
      dialog.getByLabel("Map Voltage", { exact: true }),
      "Level",
    );
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      dialog.getByRole("columnheader", { name: "Exact changes", exact: true }),
    ).toBeVisible();
    await expect(dialog).toContainText("150 kV");
    await dialog
      .getByRole("button", { name: "Confirm import", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const imported = (
      await (
        await page.request.get("/api/board-room?search=CSV-BOARD-01")
      ).json()
    ).projects[0];
    expect(imported.scope).toBe("");
    expect(imported.voltage).toBe("150 kV");
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByRole("button", { name: "2032: 1 projects", exact: true })
      .click();
    await expect(page.locator(".br-project-row")).toHaveCount(1);
    await expect(page.locator(".br-project-row")).toContainText(
      "Imported Board project",
    );
  });
  test("mutation refresh respects filters changed while a request is in flight", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/board-room");
    await page
      .locator(".br-project-name")
      .filter({ hasText: "Kalimantan solar project" })
      .click();
    await page.route("**/api/board-room", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON()?.action === "progress"
      )
        await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });
    await page
      .getByRole("button", {
        name: "Set Kalimantan solar project to stage 6: Stage 6",
        exact: true,
      })
      .click();
    await page
      .getByRole("textbox", { name: "Reason for stage jump", exact: true })
      .fill("Confirmed construction progress.");
    await page
      .getByRole("button", { name: "Apply stage change", exact: true })
      .click();
    await selectOption(
      page.getByLabel("Primary category filter", { exact: true }),
      "Transmisi",
    );
    await expect(page.locator(".br-project-row")).toHaveCount(2);
    await expect(
      page.getByText("Project progress saved", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Primary category filter", { exact: true }),
    ).toHaveAttribute("data-value", "Transmisi");
    await expect(page.locator(".br-project-row")).toHaveCount(2);
    await expect(page).toHaveURL(/category=Transmisi/);
  });
  test("read-only members and outsiders cannot mutate or bypass origin checks", async ({
    page,
    context,
  }) => {
    await signIn(context, "e2e-member");
    await page.goto("/board-room");
    await expect(
      page.getByRole("button", { name: "Add project", exact: true }),
    ).toHaveCount(0);
    let r = await page.request.post("/api/board-room", {
      headers: { origin },
      data: { action: "category", name: "Forbidden" },
    });
    expect(r.status()).toBe(403);
    await context.clearCookies();
    r = await page.request.get("/api/board-room");
    expect(r.status()).toBe(401);
    await signIn(context, "e2e-outsider");
    r = await page.request.get("/api/board-room");
    expect(r.status()).toBe(403);
    await context.clearCookies();
    await signIn(context);
    r = await page.request.post("/api/board-room", {
      headers: { origin: "https://untrusted.example" },
      data: { action: "category", name: "Forbidden origin" },
    });
    expect(r.status()).toBe(403);
  });
  test("desktop/mobile layouts, keyboard access and automated accessibility checks", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/board-room");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("heading", {
          name: "Kalimantan - Power System Projects",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: `test-results/board-room-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const axe = await new AxeBuilder({ page })
      .include(".br")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page
      .getByRole("button", { name: "Add project", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Add project", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Project name", { exact: true })
      .fill("Recoverable draft");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toContainText(
      "Your project edits and selected files have not been saved.",
    );
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel("Project name", { exact: true }),
    ).toHaveValue("Recoverable draft");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: "test-results/board-room-dark.png",
      fullPage: true,
    });
    const darkAxe = await new AxeBuilder({ page })
      .include(".br")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(darkAxe.violations).toEqual([]);
  });
});

test("Board Room navigation matches Locker Room dimensions and supports drawer keyboard navigation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const locker = await context.newPage();
  await locker.emulateMedia({ reducedMotion: "reduce" });
  await locker.goto("/demo");
  await page.goto("/board-room");
  for (const width of [1280, 1440, 1640]) {
    await page.setViewportSize({ width, height: 900 });
    await locker.setViewportSize({ width, height: 900 });
    const reference = (await locker.locator(".sidebar").boundingBox())!.width;
    await expect
      .poll(
        async () => (await page.locator(".br-sidebar").boundingBox())!.width,
      )
      .toBeCloseTo(reference, 0);
    await expect(
      page.getByRole("button", { name: "Collapse navigation", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator(".br-year")
        .evaluateAll((cards) =>
          cards.every(
            (card) =>
              Math.abs(
                card.getBoundingClientRect().top -
                  cards[0].getBoundingClientRect().top,
              ) < 1,
          ),
        ),
    ).toBeTruthy();
  }
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect
    .poll(async () => (await page.locator(".br-sidebar").boundingBox())!.width)
    .toBe(76);
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeVisible();
    if (width > 640)
      expect((await page.locator(".br-tablet-rail").boundingBox())!.width).toBe(
        72,
      );
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    const drawer = page.getByRole("dialog", { name: "Board Room navigation" });
    await expect(drawer).toBeVisible();
    expect((await drawer.boundingBox())!.width).toBe(Math.min(320, width - 20));
    if (width === 390) {
      const drawerAxe = await new AxeBuilder({ page })
        .include(".br-navigation-drawer")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(drawerAxe.violations).toEqual([]);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Project documents",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await locker.close();
});
