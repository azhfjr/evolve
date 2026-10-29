import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function inspectDialog(page: Page, actions = false) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.y).toBeGreaterThanOrEqual(11);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 12);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 11);
  await expect(
    dialog.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  if (actions) {
    const buttons = dialog.locator(
      ".form-actions > button,.modal-actions > button,.project-form-actions > button",
    );
    expect(await buttons.count()).toBeGreaterThanOrEqual(2);
    for (const button of await buttons.all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
      const rect = (await button.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(bounds.x + 12);
      expect(rect.x + rect.width).toBeLessThanOrEqual(
        bounds.x + bounds.width - 12,
      );
      expect(rect.y + rect.height).toBeLessThanOrEqual(
        bounds.y + bounds.height - 8,
      );
    }
  }
  return dialog;
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 740 },
  { width: 320, height: 568 },
  { width: 568, height: 320 },
]) {
  test(`popup shells and long-form actions stay usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/demo");
    await page.locator(".dashboard-page").waitFor();
    await page.keyboard.press("Control+f");
    let dialog = await inspectDialog(page);
    if (viewport.width === 1440)
      expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(560);
    await dialog
      .getByRole("combobox", { name: "Search all tasks", exact: true })
      .fill("review");
    await page.keyboard.press("Escape");

    await page.goto("/demo?section=tasks");
    await page.getByRole("button", { name: "Bulk edit", exact: true }).click();
    dialog = await inspectDialog(page, true);
    await dialog
      .locator('.batch-selection input[type="checkbox"]')
      .first()
      .check();
    await dialog.locator(".batch-fields-scroll").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await inspectDialog(page, true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    await inspectDialog(page, true);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Saved views", exact: true })
      .click();
    await inspectDialog(page);
    await page.keyboard.press("Escape");

    await page.goto("/demo?section=projects");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    dialog = await inspectDialog(page, true);
    await dialog.locator(".project-form").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await inspectDialog(page, true);
    await page.keyboard.press("Escape");
    await page.goto("/demo?section=projects");
    await page.locator(".portfolio-card").first().click();
    await page
      .getByRole("button", { name: "Edit project", exact: true })
      .click();
    dialog = await inspectDialog(page, true);
    const category = dialog.getByRole("combobox", {
      name: "Project category",
      exact: true,
    });
    await category.click();
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(category).toBeFocused();
    await dialog
      .getByLabel("Project name", { exact: true })
      .fill("Responsive historical project");
    await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
    await inspectDialog(page, true);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("main h1")).toContainText(
      "Responsive historical project",
    );

    await page.goto("/demo?section=activity");
    const all = page.getByRole("checkbox", {
      name: "Select all loaded activities",
      exact: true,
    });
    await all.check();
    await page
      .getByRole("button", { name: "Delete selected", exact: true })
      .click();
    dialog = await inspectDialog(page, true);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(all).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Delete selected", exact: true }),
    ).toBeFocused();
  });
}
for (const width of [1440, 390]) {
  test(`secondary popups and nested pickers retain their focus at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/demo?section=team");
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .first()
      .click();
    await inspectDialog(page, true);
    await page.keyboard.press("Escape");
    await page.goto("/demo?section=connection");
    await page
      .getByRole("button", { name: /Edit labels for/ })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Project labels", { exact: true })
      .waitFor();
    const labelsDialog = await inspectDialog(page, true);
    await labelsDialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(labelsDialog).toHaveCount(0);
    const menu = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("button", { name: "Keyboard shortcuts", exact: true })
      .click();
    await inspectDialog(page);
    await page.keyboard.press("Escape");
  });
}
for (const width of [1440, 390]) {
  test(`dark task counts and large-text popups stay readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    test.setTimeout(60000);
    for (const section of ["tasks", "mytasks"]) {
      await page.goto(`/demo?section=${section}`);
      await page.locator(".task-name").first().waitFor();
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      const taskScan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        taskScan.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }

    await page.goto("/demo?section=projects");
    await page.locator(".portfolio-card").first().click();
    await page
      .getByRole("button", { name: "Edit project", exact: true })
      .waitFor();
    // Exercise the existing large-text and dark CSS state without persisting account preferences.
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      const shell = document.querySelector<HTMLElement>(".app-shell")!;
      shell.dataset.fontScale = "large";
      shell.dataset.reduceMotion = "true";
    });
    await page
      .getByRole("button", { name: "Edit project", exact: true })
      .click();
    const dialog = await inspectDialog(page, true);
    const fonts = await dialog
      .locator('input:not([type="checkbox"]),.app-select')
      .evaluateAll((elements) =>
        elements
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
      );
    expect(Math.min(...fonts)).toBeGreaterThanOrEqual(18);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+f");
    await inspectDialog(page);
    const search = page.getByRole("combobox", {
      name: "Search all tasks",
      exact: true,
    });
    expect(
      await search.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(18);
  });
}
