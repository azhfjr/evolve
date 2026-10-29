import { test, expect } from "@playwright/test";

test("overview provides seven scoped dashboard charts, data access, and open task drilldowns", async ({
  page,
}) => {
  await page.goto("/demo");
  const overview = page.locator(".overview-dashboard");
  await expect(
    overview.locator(".overview-analytics-grid > section"),
  ).toHaveCount(7);
  await expect(overview.locator(".dashboard-welcome")).toHaveCount(0);
  const openValue = await overview
    .locator(".metric-card")
    .first()
    .locator("strong")
    .innerText();
  await expect(
    overview.getByText("Created vs completed", { exact: true }),
  ).toHaveCount(0);
  const schedule = overview.locator(".overview-schedule");
  await expect(schedule.locator(".overview-schedule-day")).toHaveCount(14);
  await expect(
    overview.locator(".metric-card").first().locator("strong"),
  ).toHaveText(openValue);
  await schedule.getByText("View data", { exact: false }).click();
  await expect(schedule.getByRole("table")).toBeVisible();
  await expect(schedule.getByRole("row")).toHaveCount(15);
  await schedule.locator(".overview-schedule-day").first().focus();
  await expect(
    schedule.locator(".overview-schedule-day").first(),
  ).toBeFocused();
  await overview.getByRole("button", { name: /^Urgent:.*View tasks$/ }).click();
  await expect(page).toHaveURL(/priority=urgent/);
  await expect(page).toHaveURL(/open=true/);
});

test("deadline today and workload drills preserve their open scope", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /^Due today:.*View tasks$/ }).click();
  await expect(page).toHaveURL(/dueBucket=today/);
  await expect(page).toHaveURL(/open=true/);
  await page.goto("/demo");
  const firstOwner = page
    .locator("[aria-labelledby=overview-workload-title] .overview-bar-row")
    .first();
  await firstOwner.click();
  await expect(page).toHaveURL(/assignee=/);
  await expect(page).toHaveURL(/open=true/);
});

for (const width of [320, 1440]) {
  test(`overview charts and tables reflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo");
    await expect(page.locator(".overview-analytics-grid")).toBeVisible();
    await page.locator(".overview-status summary").click();
    await expect(page.locator(".overview-status table")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
