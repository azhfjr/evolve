import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ context }) => {
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
});
test("dashboard ordering and task-free portfolio", async ({ page }) => {
  await page.goto("/board-room");
  await expect(
    page.getByRole("region", { name: "Portfolio summary", exact: true }),
  ).toBeVisible();
  const stages = page.getByRole("region", {
    name: "Projects by current stage",
  });
  const years = page.getByRole("region", {
    name: "Projects by planned COD year",
  });
  expect((await stages.boundingBox())!.y).toBeLessThan(
    (await years.boundingBox())!.y,
  );
  await expect(
    page.getByRole("heading", { name: "Projects by location", exact: true }),
  ).toBeVisible();
  const map = page.getByRole("region", {
    name: "Project–asset map",
    exact: true,
  });
  await expect(map).toBeVisible();
  expect((await map.boundingBox())!.y).toBeGreaterThan(
    (await page
      .getByRole("heading", { name: "Projects by location", exact: true })
      .boundingBox())!.y,
  );
  await expect(page.getByText("Open tasks", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add project task", exact: true }),
  ).toHaveCount(0);
});
test("chart drill-down preserves context and offers complete data", async ({
  page,
}) => {
  await page.goto("/board-room?search=Connected");
  await page
    .getByRole("region", { name: "Projects by category", exact: true })
    .getByRole("button", { name: "Pembangkit", exact: true })
    .click();
  await expect(page).toHaveURL(/category=Pembangkit/);
  await expect(page).toHaveURL(/search=Connected/);
  await page
    .getByRole("region", { name: "Projects by location", exact: true })
    .getByText("View data", { exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Projects by location", exact: true })
      .getByRole("table"),
  ).toBeVisible();
});
test("Board is first in chooser and meeting packs are retired", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.locator(".room-home-grid > a").first()).toHaveAttribute(
    "href",
    "/board-room",
  );
  await page.goto("/board-room");
  await expect(page.getByText("Meeting packs", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/board-room/meetings")).status()).toBe(
    404,
  );
  expect(
    (
      await page.request.get(
        "/workspace/meetings/00000000-0000-0000-0000-000000000001",
      )
    ).status(),
  ).toBe(404);
});
