import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
for (const width of [390, 1440]) {
  test(`Home provides live attention counts and matching room links at ${width}px`, async ({
    page,
    context,
  }) => {
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
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/workspace");
    const response = await page.request.get("/api/workspace/experience");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const brief = page.getByRole("region", { name: "Where to focus next" });
    await expect(brief).toBeVisible();
    const cards = brief.locator(".workspace-focus-card");
    await expect(cards).toHaveCount(6);
    const mine = brief.getByRole("link", { name: /My open work/ });
    await expect(mine.locator("strong")).toHaveText(
      data.focus.myOpen.toLocaleString("en-US"),
    );
    await expect(
      brief.getByRole("link", { name: /Documents to review/ }),
    ).toHaveAttribute(
      "href",
      "/board-room?section=documents&validation=review",
    );
    await expect(
      brief.getByRole("link", { name: /Incomplete project data/ }),
    ).toHaveAttribute(
      "href",
      "/board-room?section=projects&attention=incomplete",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await mine.click();
    await expect(page).toHaveURL(/\/app\?/);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("assignee"))
      .toBe(data.actor.email);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("open"))
      .toBe("true");
    await page.goto("/workspace");
    await page.getByRole("link", { name: /Documents to review/ }).click();
    await expect(page).toHaveURL(/\/board-room\?/);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("validation"))
      .toBe("review");
  });
}
