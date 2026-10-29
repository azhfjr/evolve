import { historicalProject } from "./historical-project-fixture";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { selectOption } from "./ui-helpers";

async function signIn(context: BrowserContext) {
  const sessions = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: sessions["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function createFixture(page: Page) {
  const name = `Portfolio costs ${randomUUID().slice(0, 8)}`;
  const project = await historicalProject(page, {
    action: "createProject",
    name,
    category: "Pembangkit",
    plannedCodYear: 2032,
    status: "planned",
    costOptions: [
      {
        id: randomUUID(),
        title: "Construction package",
        items: [
          {
            id: randomUUID(),
            title: "Equipment",
            unit: "IDR",
            amount: "2000000",
          },
          {
            id: randomUUID(),
            title: "Consulting",
            unit: "USD",
            amount: "1250.50",
          },
        ],
      },
      {
        id: randomUUID(),
        title: "Tariff package",
        items: [
          {
            id: randomUUID(),
            title: "Energy component",
            unit: "cUSD/kWh",
            amount: "5.123456",
          },
          {
            id: randomUUID(),
            title: "Energy adjustment",
            unit: "cUSD/kWh",
            amount: "0.000001",
          },
          {
            id: randomUUID(),
            title: "Local tariff",
            unit: "Rp/kWh",
            amount: "1350.125678",
          },
        ],
      },
    ],
  });
  return { name, project };
}

test("Projects checklist exposes every option and cost, separate exact totals, filters and keyboard disclosure", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { name, project } = await createFixture(page);
  await page.goto("/app?section=projects");
  const portfolio = page.locator(".portfolio-page");
  await portfolio.getByLabel("Search projects", { exact: true }).fill(name);
  await expect(portfolio.locator(".portfolio-card")).toHaveCount(1);
  await expect(portfolio).toContainText("Planned COD 2032");
  await portfolio
    .getByRole("button", { name: "Checklist", exact: true })
    .click();
  const row = portfolio.locator(`[data-project-id="${project.id}"]`);
  await expect(row.getByText("Equipment", { exact: true })).toBeVisible();
  await expect(row.getByText("Local tariff", { exact: true })).toBeVisible();
  const option = row
    .locator(".checklist-option")
    .filter({ hasText: "Construction package" });
  const tariffOption = row
    .locator(".checklist-option")
    .filter({ hasText: "Tariff package" });
  await expect(
    option.locator('.checklist-option-total-row [data-unit="IDR"]'),
  ).toHaveText("IDR 2,000,000");
  await expect(
    option.locator('.checklist-option-total-row [data-unit="USD"]'),
  ).toHaveText("$1,250.50");
  await expect(
    tariffOption.locator('.checklist-option-total-row [data-unit="cUSD/kWh"]'),
  ).toHaveText("5.123457 cUSD/kWh");
  await expect(
    tariffOption.locator('.checklist-option-total-row [data-unit="Rp/kWh"]'),
  ).toHaveText("1,350.125678 Rp/kWh");
  await expect(row.locator(".checklist-project-total-row")).toHaveCount(0);
  await expect(row.locator("input[type=checkbox]")).toHaveCount(0);
  await option.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(option.getByText("Equipment", { exact: true })).toBeHidden();
  await page.keyboard.press("Space");
  await expect(option.getByText("Equipment", { exact: true })).toBeVisible();
  await portfolio
    .getByLabel("Search projects", { exact: true })
    .fill("Energy component");
  await expect(row).toBeVisible();
  await portfolio.getByLabel("Search projects", { exact: true }).fill(name);
  await selectOption(
    portfolio.getByLabel("Project category", { exact: true }),
    "Transmisi",
  );
  await expect(
    portfolio.getByText("No matching projects", { exact: true }),
  ).toBeVisible();
  await portfolio.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(
    portfolio.getByText("No matching projects", { exact: true }),
  ).toBeVisible();
  await selectOption(
    portfolio.getByLabel("Project category", { exact: true }),
    "Pembangkit",
  );
  await expect(portfolio.locator(".portfolio-card")).toHaveCount(1);
  await selectOption(
    portfolio.getByLabel("Project status", { exact: true }),
    "completed",
  );
  await expect(
    portfolio.getByText("No matching projects", { exact: true }),
  ).toBeVisible();
  await selectOption(
    portfolio.getByLabel("Project status", { exact: true }),
    "planned",
  );
  await portfolio.getByLabel("Search projects", { exact: true }).fill("2032");
  await expect(
    portfolio.locator(".portfolio-card").filter({ hasText: name }),
  ).toBeVisible();
  await portfolio
    .getByRole("button", { name: "Checklist", exact: true })
    .click();
  await row
    .getByRole("button", { name: `Open project: ${name}`, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`project=${project.id}`));
});

for (const width of [320, 390, 768, 1440]) {
  test(`Projects checklist stays accessible without page overflow at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(context);
    const { name } = await createFixture(page);
    await page.goto("/app?section=projects");
    const portfolio = page.locator(".portfolio-page");
    await portfolio.getByLabel("Search projects", { exact: true }).fill(name);
    await portfolio
      .getByRole("button", { name: "Checklist", exact: true })
      .click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (width === 390) {
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.style.fontSize = "125%";
      });
    }
    await expect(
      portfolio.getByText("Equipment", { exact: true }),
    ).toBeVisible();
    await expect(
      portfolio.getByText("Energy component", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .include(".portfolio-page")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
}

test("legacy projects show their existing costs in the checklist", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  const portfolio = page.locator(".portfolio-page");
  await portfolio
    .getByRole("button", { name: "Checklist", exact: true })
    .click();
  const row = portfolio.locator(
    '[data-project-id="00000000-0000-4000-8000-000000000001"]',
  );
  await expect(row.getByText("General costs", { exact: true })).toBeVisible();
  await expect(row.getByText("Project cost", { exact: true })).toBeVisible();
});
