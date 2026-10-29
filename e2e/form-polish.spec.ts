import { demoHistoricalCost } from "./historical-project-fixture";
import { editorSurface } from "./ui-helpers";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function nav(page: import("@playwright/test").Page, label: string) {
  await expect(page.locator(".topbar")).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
}
for (const width of [1440, 768, 360])
  test(`data-entry panels are readable, centered, and keyboard usable at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = editorSurface(page);
    await expect(
      dialog.getByRole("heading", { name: "Task essentials", exact: true }),
    ).toBeVisible();
    await dialog
      .getByLabel("Task title", { exact: true })
      .fill("Plan the next system investment review");
    const measure = async () =>
      dialog.evaluate((element) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        inputFonts: [
          ...element.querySelectorAll(
            "input:not([type=checkbox],[type=radio]),.app-select,textarea",
          ),
        ]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
        clippedChoices: [
          ...element.querySelectorAll(".app-select .select-value>span"),
        ]
          .filter((e) => e.scrollWidth > e.clientWidth + 1)
          .map((e) => e.textContent),
        labels: [
          ...element.querySelectorAll(
            ".editor-title-field>label,.editor-description-field>label,.editor-property>span:first-child,.editor-date-property>label",
          ),
        ].map((e) => parseFloat(getComputedStyle(e).fontSize)),
      }));
    let result = await measure();
    expect(result.overflow).toBe(false);
    expect(result.clippedChoices).toEqual([]);
    expect(result.left).toBeGreaterThanOrEqual(-1);
    expect(result.right).toBeLessThanOrEqual(result.width + 1);
    // The revised desktop scale is compact; phones keep the no-zoom 16px minimum.
    expect(Math.min(...result.inputFonts)).toBeGreaterThanOrEqual(
      width <= 640 ? 16 : 14,
    );
    expect(Math.min(...result.labels)).toBeGreaterThanOrEqual(13);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await dialog
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await nav(page, "Projects");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    result = await measure();
    expect(result.left).toBeGreaterThanOrEqual(-1);
    expect(result.right).toBeLessThanOrEqual(result.width + 1);
    expect(result.overflow).toBe(false);
    const submit = dialog.getByRole("button", {
      name: "Create project",
      exact: true,
    });
    const bounds = await submit.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
    await dialog
      .getByLabel("Project name", { exact: true })
      .fill(`Investment layout ${width}`);
    await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
    const projectScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      projectScan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({ path: `test-results/project-form-${width}.png` });
    await submit.click();
    await expect(dialog).toHaveCount(0);
    await page
      .locator(".portfolio-card")
      .filter({ hasText: `Investment layout ${width}` })
      .click();
    await demoHistoricalCost(page, `Investment layout ${width}`, "18500.75");
    await expect(
      page.getByRole("heading", { name: "Cost", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(
        '.cost-option-summary .cost-option-totals strong[data-unit="USD"]',
      ),
    ).toHaveText("$18,500.75");
    await page.reload();
    await expect(
      page.locator(
        '.cost-option-summary .cost-option-totals strong[data-unit="USD"]',
      ),
    ).toHaveText("$18,500.75");
  });
test("financial summaries stay inside each project while Dashboard and Projects stay focused on delivery", async ({
  page,
}) => {
  await page.goto("/demo");
  await nav(page, "Projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = editorSurface(page);
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Investment scope verification");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .locator(".portfolio-card")
    .filter({ hasText: "Investment scope verification" })
    .click();
  await demoHistoricalCost(page, "Investment scope verification", "74321.50");
  await expect(
    page.locator(
      '.cost-option-summary .cost-option-totals strong[data-unit="USD"]',
    ),
  ).toHaveText("$74,321.50");
  for (const section of ["Overview", "Projects"]) {
    await nav(page, section);
    await expect(page.locator("main")).not.toContainText("$74,321.50");
    await expect(
      page.getByText(
        /portfolio budget|recorded costs?|Investment cost|Amount/i,
      ),
    ).toHaveCount(0);
  }
  await page.evaluate(() => window.scrollTo(0, 400));
  await nav(page, "Activity");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
test("saved workspace text preferences preserve responsive sizing and reduced motion", async ({
  page,
}) => {
  await page.goto("/demo?section=settings&tab=workspace");
  await expect(
    page.getByRole("heading", { name: "Workspace appearance", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Workspace text size", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Content width", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    data.settings = {
      ...data.settings,
      configuration: {
        ...data.settings?.configuration,
        fontScale: "large",
        sidebarWidth: 360,
        contentWidth: "comfortable",
      },
    };
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-font-scale",
    "large",
  );
  await nav(page, "All tasks");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = editorSurface(page);
  await expect(dialog).toBeVisible();
  const styles = await dialog.evaluate((e) => ({
    font: parseFloat(
      getComputedStyle(e.querySelector(".app-select")!).fontSize,
    ),
    animation: getComputedStyle(e).animationName,
    left: e.getBoundingClientRect().left,
  }));
  expect(styles.font).toBeGreaterThanOrEqual(13);
  expect(styles.font).toBe(18);
  expect(styles.animation).toBe("none");
  expect(styles.left).toBeGreaterThanOrEqual(0);
});
