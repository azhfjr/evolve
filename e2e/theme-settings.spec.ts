import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { AccountProfile } from "../src/lib/preferences";

test("sidebar theme saves preserve unsaved account edits and stay synchronized with Settings", async ({
  context,
  page,
}) => {
  const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth["e2e-member"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  async function readProfile(): Promise<AccountProfile> {
    const response = await page.request.get("/api/workspace");
    expect(response.ok()).toBeTruthy();
    return (await response.json()).profile;
  }
  const original = await readProfile();
  const theme = original.preferences.theme === "dark" ? "light" : "dark";
  const themeLabel = theme === "dark" ? "Dark" : "Light";
  const editedBio = `Unsaved account draft retained after sidebar ${theme} save.`;
  const editedName = "Theme settings draft member";
  try {
    await page.goto("/app?section=settings&tab=account");
    const settings = page.locator(".account-settings");
    await settings.getByLabel("Display name", { exact: true }).fill(editedName);
    await settings
      .getByRole("textbox", { name: "Bio", exact: true })
      .fill(editedBio);

    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: themeLabel, exact: true })
      .click();
    await expect
      .poll(async () => (await readProfile()).preferences.theme)
      .toBe(theme);
    // The sidebar saves the persisted profile only; the form's local draft is
    // still unsaved and must survive the returned profile/version update.
    const afterTheme = await readProfile();
    expect(afterTheme.bio).toBe(original.bio);
    expect(afterTheme.name).toBe(original.name);
    expect(afterTheme.version).toBeGreaterThan(original.version);
    await expect(
      settings.getByRole("textbox", { name: "Bio", exact: true }),
    ).toHaveValue(editedBio);
    await expect(
      settings.getByLabel("Display name", { exact: true }),
    ).toHaveValue(editedName);
    await settings
      .getByRole("tab", { name: "Appearance", exact: true })
      .click();
    await expect(
      settings.getByRole("radio", { name: themeLabel, exact: true }),
    ).toBeChecked();
    await settings
      .getByRole("tab", { name: "My account", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "Save account settings", exact: true })
      .click();
    await expect
      .poll(async () => {
        const profile = await readProfile();
        return {
          bio: profile.bio,
          name: profile.name,
          theme: profile.preferences.theme,
        };
      })
      .toEqual({ bio: editedBio, name: editedName, theme });
    expect((await readProfile()).version).toBeGreaterThan(afterTheme.version);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(
      settings.getByRole("textbox", { name: "Bio", exact: true }),
    ).toHaveValue(editedBio);
    await expect(
      settings.getByLabel("Display name", { exact: true }),
    ).toHaveValue(editedName);
    await settings
      .getByRole("tab", { name: "Appearance", exact: true })
      .click();
    await expect(
      settings.getByRole("radio", { name: themeLabel, exact: true }),
    ).toBeChecked();
  } finally {
    const current = await readProfile();
    const restored = await page.request.post("/api/workspace", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { action: "updateProfile", ...original, version: current.version },
    });
    expect(restored.ok()).toBeTruthy();
  }
});
