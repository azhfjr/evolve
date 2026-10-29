import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Retiring the product surface must not rewrite the browser's historical data.
test("Cost retains option totals while historical Expense data stays untouched", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.locator(".portfolio-page").waitFor();
  const historical = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    const project = data.projects[0];
    const entry = {
      id: crypto.randomUUID(),
      projectId: project.id,
      description: "Historical expense retained after retirement",
      amount: "125.50",
      currency: "USD",
      category: "engineering",
      bookedOn: "2026-10-01",
      payee: "Historical partner",
      version: 1,
      voided: false,
      createdBy: data.actor.email,
      createdAt: new Date().toISOString(),
    };
    data.expenses = [entry];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
    return { projectId: project.id, expenses: data.expenses };
  });
  await page.goto(`/demo?section=project&project=${historical.projectId}`);
  const cost = page.locator(".project-finance");
  await expect(
    cost.getByRole("heading", { name: "Cost", exact: true }),
  ).toBeVisible();
  await expect(
    cost.getByRole("button", { name: "Manage costs", exact: true }),
  ).toHaveCount(0);
  await expect(
    cost.getByRole("button", { name: "Record expense", exact: true }),
  ).toHaveCount(0);
  await expect(
    cost.locator(".finance-metrics,.ledger-table,.expense-dialog"),
  ).toHaveCount(0);
  await expect(
    cost.getByRole("heading", { name: "Recorded expenses", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("evolve-demo-v1")!).expenses,
    ),
  ).toEqual(historical.expenses);
});

test("retired Expense endpoints reject writes and ledger access without expanding permissions", async ({
  context,
  page,
}) => {
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
  const workspace = await (await page.request.get("/api/workspace")).json();
  const projectId = workspace.projects[0].id;
  const ledger = await page.request.get(`/api/projects/${projectId}/costs`);
  expect(ledger.status()).toBe(410);
  for (const command of [
    {
      action: "addExpense",
      projectId,
      description: "Retired feature must not save this entry",
      amount: "125.50",
      currency: "USD",
      category: "engineering",
      bookedOn: "2026-10-01",
      payee: "",
      idempotencyKey: crypto.randomUUID(),
    },
    {
      action: "setExpenseVoided",
      id: crypto.randomUUID(),
      version: 1,
      voided: true,
    },
  ]) {
    const response = await page.request.post("/api/workspace", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: command,
    });
    expect(response.status()).toBe(410);
  }
  await context.clearCookies();
  expect(
    (await page.request.get(`/api/projects/${projectId}/costs`)).status(),
  ).toBe(401);
});
