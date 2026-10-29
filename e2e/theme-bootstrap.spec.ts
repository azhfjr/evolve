import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("anonymous theme is resolved before body content and tolerates blocked storage", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage denied");
      },
    });
    new MutationObserver(() => {
      if (document.body && !document.documentElement.dataset.firstBodyTheme)
        document.documentElement.dataset.firstBodyTheme =
          document.documentElement.dataset.theme;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-first-body-theme",
    "dark",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("authenticated first device SSR and sidebar use saved account theme despite stale cache", async ({
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
  const original = (await (await page.request.get("/api/workspace")).json())
    .profile;
  const save = async (profile: typeof original, theme: string) => {
    const response = await page.request.post("/api/workspace", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        action: "updateProfile",
        ...profile,
        preferences: { ...profile.preferences, theme },
      },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).profile;
  };
  await save(original, "dark");
  try {
    const response = await page.request.get("/app");
    expect(await response.text()).toContain('data-theme="dark"');
    await page.addInitScript(() =>
      localStorage.setItem("evolve-theme", "light"),
    );
    await page.goto("/app");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "Light", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).profile
            .preferences.theme,
      )
      .toBe("light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.route("**/api/workspace", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON()?.action === "updateProfile"
      )
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Profile changed" }),
        });
      else await route.continue();
    });
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "Dark", exact: true })
      .click();
    await expect(
      page.getByText("Profile changed", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(
      await page.evaluate(() => localStorage.getItem("evolve-theme")),
    ).toBe("light");
    await page.unroute("**/api/workspace");
  } finally {
    const current = (await (await page.request.get("/api/workspace")).json())
      .profile;
    await save(
      { ...original, version: current.version },
      original.preferences.theme,
    );
  }
});
