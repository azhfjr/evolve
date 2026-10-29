import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";
test.beforeEach(async ({ context }) => {
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
});
test("assets have native creation, CSV template, searchable data and a connection list", async ({
  page,
}) => {
  await page.goto("/board-room?section=assets");
  await expect(
    page.getByRole("heading", { name: "Assets database" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download asset template" }),
  ).toHaveAttribute("href", "/board-room/asset-upload-template.csv");
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("RUPTL code", { exact: true })
    .fill("E2E-" + Date.now());
  await dialog
    .getByLabel("Asset name", { exact: true })
    .fill("Connected asset journey");
  await selectOption(
    dialog.getByLabel("Primary category", { exact: true }),
    "Pembangkit",
  );
  await dialog.getByRole("button", { name: "Save asset", exact: true }).click();
  await page.getByLabel("Search assets").fill("Connected asset journey");
  await expect(
    page.getByRole("button", { name: "Connected asset journey", exact: true }),
  ).toBeVisible();
  await page.goto("/board-room?section=connections");
  await expect(
    page.getByRole("heading", { name: "Project–asset connections" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^Project\s+Unassigned assets$/,
    }),
  ).toBeVisible();
});
