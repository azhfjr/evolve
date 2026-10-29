import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ context }) => {
  const t = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: t["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
test("zero-count regions use the theme neutral surface", async ({ page }) => {
  await page.goto("/board-room?search=no-region-colour-test");
  const map = page.getByRole("region", {
    name: "Kalimantan regional distribution",
    exact: true,
  });
  await expect(map.locator("svg path")).toHaveCount(5);
  const colours = await map.evaluate((el) => {
    const reference = document.createElement("span");
    reference.style.color = "var(--soft)";
    el.append(reference);
    const neutral = getComputedStyle(reference).color;
    reference.remove();
    return {
      neutral,
      actual: getComputedStyle(el.querySelector("svg path")!).fill,
    };
  });
  expect(colours.actual).toBe(colours.neutral);
});
test("regional focus feedback survives pointer exit", async ({ page }) => {
  await page.goto("/board-room?search=no-region-focus-test");
  const map = page.getByRole("region", {
    name: "Kalimantan regional distribution",
    exact: true,
  });
  const west = map.getByRole("button", { name: /Kalimantan Barat/ });
  await west.focus();
  await west.hover();
  await page.mouse.move(0, 0);
  await expect(west).toBeFocused();
  await expect(map.getByRole("status")).toContainText("Kalimantan Barat");
});
test("both shells respect comfortable content width and large-font attributes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const [route, root, content, title] of [
    ["/board-room", ".br", ".br-content", ".br h1"],
    ["/app", ".app-shell", ".workspace-main", ".page-header h1"],
  ]) {
    await page.goto(route);
    await page.locator(content).waitFor();
    await page.locator(".room-loading").waitFor({ state: "hidden" });
    await page.locator(root).evaluate((el) => {
      el.setAttribute("data-content-width", "wide");
      el.setAttribute("data-font-scale", "standard");
    });
    const wide = (await page.locator(content).boundingBox())!.width;
    await page.locator(root).evaluate((el) => {
      el.setAttribute("data-content-width", "comfortable");
      el.setAttribute("data-font-scale", "large");
    });
    await expect(page.locator(title).first()).toHaveCSS("font-size", "28px");
    const comfortable = (await page.locator(content).boundingBox())!.width;
    expect(comfortable, route).toBeLessThan(wide);
    expect(comfortable).toBeLessThanOrEqual(1360);
  }
});
