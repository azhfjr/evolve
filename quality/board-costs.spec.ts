import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "../e2e/ui-helpers";
import AxeBuilder from "@axe-core/playwright";
let id: string;
test.beforeEach(async ({ context, page }) => {
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
  const r = await page.request.post("/api/board-room", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      requestId: crypto.randomUUID(),
      values: {
        externalId: "COST-" + crypto.randomUUID(),
        name: "Cost QA " + crypto.randomUUID(),
        category: "Pembangkit",
      },
    },
  });
  expect(r.ok()).toBeTruthy();
  id = (await r.json()).project.id;
});
async function edit(page: Page) {
  await page.goto("/board-room?section=costs&costProject=" + id);
  await page
    .getByRole("button", { name: "Edit project costs", exact: true })
    .click();
  return page.getByRole("dialog");
}
test("all four units, grouped exact totals and reload retain financial precision", async ({
  page,
}) => {
  const d = await edit(page);
  await d.getByRole("button", { name: "Add option", exact: true }).click();
  await d.getByLabel("Option name", { exact: true }).fill("Exact alternatives");
  const units = ["IDR", "USD", "cUSD/kWh", "Rp/kWh"];
  for (let i = 0; i < units.length; i++) {
    if (i)
      await d.getByRole("button", { name: "Add cost", exact: true }).click();
    const suffix = i ? " " + (i + 1) : "";
    await d
      .getByLabel("Cost title" + suffix, { exact: true })
      .fill("Cost " + units[i]);
    await selectOption(
      d.getByLabel("Unit" + suffix, { exact: true }),
      units[i],
    );
    await d
      .getByLabel("Amount" + suffix, { exact: true })
      .fill(i < 2 ? "123456789012345678901234567890.12" : "0.123456");
  }
  await d
    .getByRole("button", { name: "Save project costs", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await page.reload();
  const data = await (
    await page.request.get("/api/board-room/costs?id=" + id)
  ).json();
  expect(
    data.options
      .find((o: { title: string }) => o.title === "Exact alternatives")
      .items.map((i: { amount: string }) => i.amount),
  ).toEqual([
    "123456789012345678901234567890.12",
    "123456789012345678901234567890.12",
    "0.123456",
    "0.123456",
  ]);
});
test("cancelled financial input cannot persist and keeps editing on dismissal", async ({
  page,
}) => {
  const baseline = await (
    await page.request.get("/api/board-room/costs?id=" + id)
  ).json();
  const d = await edit(page);
  await d.getByRole("button", { name: "Add option", exact: true }).click();
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    d.getByRole("heading", {
      name: "Discard unsaved project costs?",
      exact: true,
    }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(d.getByLabel("Option name", { exact: true })).toBeVisible();
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  await d.getByRole("button", { name: "Discard changes", exact: true }).click();
  expect(
    (await (await page.request.get("/api/board-room/costs?id=" + id)).json())
      .options,
  ).toEqual(baseline.options);
});
test("concurrent financial update preserves local input and reports conflict", async ({
  page,
}) => {
  const d = await edit(page);
  await d.getByRole("button", { name: "Add option", exact: true }).click();
  await d.getByLabel("Option name", { exact: true }).fill("Local unsaved");
  await d.getByLabel("Cost title", { exact: true }).fill("Local item");
  await d.getByLabel("Amount", { exact: true }).fill("12.50");
  const r = await (
    await page.request.get("/api/board-room/costs?id=" + id)
  ).json();
  expect(
    (
      await page.request.post("/api/board-room/costs?id=" + id, {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { version: r.version, options: [] },
      })
    ).ok(),
  ).toBeTruthy();
  await d
    .getByRole("button", { name: "Save project costs", exact: true })
    .click();
  await expect(d.getByRole("alert")).toContainText("changed");
  await expect(d.getByLabel("Option name", { exact: true })).toHaveValue(
    "Local unsaved",
  );
});
for (const width of [320, 390, 768, 1024, 1440])
  test(`financial editor is keyboard accessible without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const d = await edit(page);
    await d.getByRole("button", { name: "Add option", exact: true }).click();
    await d.getByLabel("Option name", { exact: true }).fill("Readable option");
    await d
      .getByLabel("Cost title", { exact: true })
      .fill("Long technical equipment and installation cost description");
    await d
      .getByLabel("Amount", { exact: true })
      .fill("999999999999999999999999999999.99");
    expect(
      await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBeTruthy();
    const a = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(
      a.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });
