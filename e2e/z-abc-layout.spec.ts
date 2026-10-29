import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function signIn(context: BrowserContext) {
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
}
test("saved-view names retain a usable reading width on phones", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context);
  const r = await page.request.post("/api/board-room/views", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { name: "Generation portfolio for COD 2028", filters: {} },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Apply Generation portfolio for COD 2028",
    exact: true,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(180);
    expect(box!.height).toBeLessThanOrEqual(90);
    await page.screenshot({
      path: testInfo.outputPath(`abc-views-${width}.png`),
    });
  }
});
test("approval handoff keeps the same inner spacing as other forms", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context);
  await page.goto("/board-room?section=people");
  await page
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name", { exact: true }).fill("Layout example");
  await dialog
    .getByLabel("Google email address", { exact: true })
    .fill("layout-example@example.test");
  await dialog
    .getByRole("button", { name: "Approve teammate", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Teammate approved", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const frame = await dialog.boundingBox();
    const text = await dialog
      .locator(".invitation-handoff > p")
      .first()
      .boundingBox();
    const input = await dialog
      .getByRole("textbox", { name: "Sign-in link", exact: true })
      .boundingBox();
    expect(text!.x - frame!.x).toBeGreaterThanOrEqual(16);
    expect(
      frame!.x + frame!.width - input!.x - input!.width,
    ).toBeGreaterThanOrEqual(16);
    await page.screenshot({
      path: testInfo.outputPath(`abc-handoff-${width}.png`),
    });
  }
});
