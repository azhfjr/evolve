import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
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
test("Board account, appearance and file controls match Locker composition", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ["My account", "Appearance", "Files"]) {
      const samples = [];
      for (const route of [
        "/app?section=settings",
        "/board-room?section=preferences",
      ]) {
        await page.goto(route);
        const settings = page.locator(".account-settings");
        await settings.getByRole("tab", { name: tab, exact: true }).click();
        const selectors = [
          ".settings-navigation button[aria-selected=true]",
          ".settings-detail",
          ".settings-detail > header h2",
          ".settings-detail > header p",
          tab === "Files"
            ? ".file-manager-toolbar .search-field input"
            : ".standard-form label",
          tab === "Files"
            ? ".file-manager-toolbar .app-select"
            : tab === "Appearance"
              ? ".standard-form .app-select"
              : ".standard-form input:not([type=checkbox],[type=radio],[type=file],[readonly])",
        ];
        const result = [];
        for (const selector of selectors) {
          const element = settings.locator(selector).first();
          await expect(element).toBeVisible();
          result.push(
            await element.evaluate((el) => {
              const s = getComputedStyle(el);
              return Object.fromEntries(
                [
                  "fontSize",
                  "fontFamily",
                  "fontWeight",
                  "lineHeight",
                  "padding",
                  "borderRadius",
                  "minHeight",
                  "display",
                  "gap",
                  "alignItems",
                  "justifyContent",
                ].map((k) => [
                  k,
                  s.getPropertyValue(
                    k.replace(/[A-Z]/g, (v) => "-" + v.toLowerCase()),
                  ),
                ]),
              );
            }),
          );
        }
        samples.push(result);
        if (route.startsWith("/board-room")) {
          if (tab === "Files")
            await settings
              .getByRole("region", { name: "Workspace files", exact: true })
              .waitFor();
          await settings.screenshot({
            path: `docs/screenshots/board-settings-${tab.toLowerCase().replaceAll(" ", "-")}-${width}.png`,
          });
        }
      }
      expect(samples[1], `${width}px ${tab}`).toEqual(samples[0]);
    }
  }
});
test("Board settings and project metadata expose only the requested controls", async ({
  page,
}) => {
  await page.goto("/board-room?section=preferences");
  const settings = page.locator(".account-settings");
  await expect(settings.getByRole("tab")).toHaveText([
    "My account",
    "Appearance",
    "Files",
  ]);
  await page
    .locator(".br-desktop-sidebar")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  await expect(
    page.getByLabel("Custom category filter", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".br-desktop-sidebar")
      .getByRole("button", { name: "Categories", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("textbox", { name: "Scope", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Voltage", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Custom categories", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/board-room", {
        headers: { origin },
        data: { action: "category", name: "Retired" },
      })
    ).status(),
  ).toBe(400);
});

test("Voltage persists through native project controls while Scope is retired", async ({
  page,
}) => {
  const name = `Scope contract ${Date.now()}`;
  const code = name;
  await page.goto("/board-room?section=projects");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name", { exact: true }).fill(name);
  await expect(
    dialog.getByRole("textbox", { name: "Scope", exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("Voltage", { exact: true }).fill("275/150 kV");
  await dialog
    .getByRole("button", { name: /^(Save|Create) project$/, exact: true })
    .click();
  await dialog
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Edit project", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Search projects", { exact: true }).fill(code);
  const row = page.getByRole("row").filter({ hasText: code });
  await expect(row).toContainText("275/150 kV");
  await expect(
    page.getByRole("columnheader", { name: "Scope", exact: true }),
  ).toHaveCount(0);
  await row.getByRole("button", { name, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator(".br-scope-detail")).toHaveCount(0);
  await expect(dialog.locator(".br-metadata")).toContainText("275/150 kV");
  await dialog
    .getByRole("button", { name: "Edit project", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Scope", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Voltage", { exact: true })).toHaveValue(
    "275/150 kV",
  );
  await dialog.getByLabel("Voltage", { exact: true }).fill("150");
  await dialog
    .getByRole("button", { name: /^(Save|Create) project$/, exact: true })
    .click();
  await expect(dialog.locator(".br-scope-detail")).toHaveCount(0);
  await expect(
    dialog.locator(".br-metadata").getByText("150", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const snapshot = await (
    await page.request.get(`/api/board-room?search=${code}`)
  ).json();
  expect(snapshot.projects[0].scope).toBe("");
  expect(snapshot.projects[0].voltage).toBe("150");
  expect(snapshot.projects[0]).not.toHaveProperty("categoryIds");
  const exported = await page.request.get(
    `/api/board-room?export=csv&search=${code}`,
  );
  expect((await exported.text()).split("\n")[0]).not.toContain("Scope");
  expect(await exported.text()).not.toContain("Custom categories");
});
