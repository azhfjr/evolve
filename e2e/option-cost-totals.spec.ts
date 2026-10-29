import { test, expect } from "@playwright/test";

const projectId = "00000000-0000-4000-8000-000000000001";
test("cost detail, editor and project checklist total each option independently", async ({
  page,
}) => {
  await page.goto(`/demo?section=project&project=${projectId}`);
  await page.locator(".project-finance").waitFor();
  await page.evaluate((projectId) => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    const project = data.projects.find(
      (p: { id: string }) => p.id === projectId,
    );
    project.costOptions = [
      {
        id: crypto.randomUUID(),
        title: "Option A",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Equipment A",
            unit: "USD",
            amount: "100.00",
          },
          {
            id: crypto.randomUUID(),
            title: "Engineering A",
            unit: "USD",
            amount: "50.00",
          },
          {
            id: crypto.randomUUID(),
            title: "Tariff A",
            unit: "cUSD/kWh",
            amount: "5.123456",
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        title: "Option B",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Equipment B",
            unit: "USD",
            amount: "200.00",
          },
          {
            id: crypto.randomUUID(),
            title: "Engineering B",
            unit: "USD",
            amount: "25.00",
          },
          {
            id: crypto.randomUUID(),
            title: "Tariff B",
            unit: "cUSD/kWh",
            amount: "7.000001",
          },
        ],
      },
    ];
    // Keep a pre-revision compatibility projection: actual costs remain in groups.
    project.currency = "USD";
    project.budget = "375.00";
    project.costItems = project.costOptions.flatMap(
      (option: {
        items: { id: string; title: string; unit: string; amount: string }[];
      }) =>
        option.items
          .filter((item) => item.unit === "USD")
          .map(({ unit, ...item }) => ({ ...item, currency: unit })),
    );
    data.expenses = [
      {
        id: crypto.randomUUID(),
        projectId,
        currency: "USD",
        amount: "25.00",
        description: "Separate recorded expense",
        category: "other",
        bookedOn: "2026-10-20",
        payee: "",
        createdBy: data.actor.email,
        createdAt: new Date().toISOString(),
        voided: false,
        version: 1,
      },
    ];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  }, projectId);
  await page.reload();
  const finance = page.locator(".project-finance");
  const a = finance.locator(".cost-option-summary").filter({
    has: page.getByRole("heading", { name: "Option A", exact: true }),
  });
  const b = finance.locator(".cost-option-summary").filter({
    has: page.getByRole("heading", { name: "Option B", exact: true }),
  });
  await expect(a.locator('.cost-option-totals [data-unit="USD"]')).toHaveText(
    "$150.00",
  );
  await expect(b.locator('.cost-option-totals [data-unit="USD"]')).toHaveText(
    "$225.00",
  );
  await expect(
    a.locator('.cost-option-totals [data-unit="cUSD/kWh"]'),
  ).toHaveText("5.123456 cUSD/kWh");
  await expect(
    b.locator('.cost-option-totals [data-unit="cUSD/kWh"]'),
  ).toHaveText("7.000001 cUSD/kWh");
  await expect(finance.getByText("Remaining", { exact: true })).toHaveCount(0);
  await expect(
    finance.getByText("Above planned cost", { exact: true }),
  ).toHaveCount(0);
  await expect(finance.getByText("$375.00", { exact: true })).toHaveCount(0);
  await expect(finance.locator(".finance-metrics")).toHaveCount(0);
  await expect(
    finance.getByText("Separate recorded expense", { exact: true }),
  ).toHaveCount(0);
  await expect(
    finance.getByRole("button", { name: "Manage costs", exact: true }),
  ).toHaveCount(0);
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "Checklist", exact: true }).click();
  const row = page.locator(`[data-project-id="${projectId}"]`);
  const option = (title: string) =>
    row.locator(".checklist-option").filter({
      has: page.locator(".checklist-option-name", { hasText: title }),
    });
  await expect(
    option("Option A").locator('.checklist-unit-totals [data-unit="USD"]'),
  ).toHaveText("$150.00");
  await expect(
    option("Option B").locator('.checklist-unit-totals [data-unit="USD"]'),
  ).toHaveText("$225.00");
  await expect(row.locator(".checklist-project-totals")).toHaveCount(0);
  await expect(row.getByText("$375.00", { exact: true })).toHaveCount(0);
});
