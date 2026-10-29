import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("focused tooltip reconciles after its own category drill-down", async ({
  page,
  context,
}) => {
  const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: tokens["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const base = await (await page.request.get("/api/board-room")).json();
  await page.route("**/api/board-room?**", async (route) => {
    const filtered =
      new URL(route.request().url()).searchParams.get("category") ===
      "Pembangkit";
    const total = filtered ? 2 : 6;
    await route.fulfill({
      json: {
        ...base,
        summary: {
          ...base.summary,
          total,
          noFiles: total,
          valid: 0,
          needsReview: 0,
          categories: [
            { name: "Pembangkit", total: 2, valid: 0 },
            { name: "Transmisi", total: filtered ? 0 : 3, valid: 0 },
            { name: "Gardu Induk", total: filtered ? 0 : 1, valid: 0 },
          ],
        },
      },
    });
  });
  await page.goto("/board-room");
  await page
    .getByRole("button", { name: "Refresh Board Room", exact: true })
    .click();
  const chart = page.getByRole("region", {
    name: "Projects by category",
    exact: true,
  });
  await expect(chart.locator("svg [role=button]")).toHaveCount(3);
  const slice = chart.getByRole("button", { name: /^Select Pembangkit/ });
  await slice.focus();
  await expect(chart.getByRole("status")).toContainText("33.3%");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/category=Pembangkit/);
  await expect(chart.locator(".portfolio-legend")).toContainText("100.0%");
  await expect(chart.getByRole("status")).toContainText("100.0%");
});
