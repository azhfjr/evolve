import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 740 },
  { width: 568, height: 320 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`long project and account content stays inside its container at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/demo?section=projects");
    await page.locator(".portfolio-card").first().waitFor();
    const longName = "ProjectLongName".repeat(5);
    await page.evaluate((longName) => {
      const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
      data.projects[0].name = longName;
      data.projects[0].description = "DescriptionLongWord".repeat(100);
      data.projects[0].reference = "REFERENCE".repeat(6);
      data.projects[0].ownerEmail = data.members[0].email;
      data.members[0].name = "OwnerLongName".repeat(6);
      if (data.activities?.[0]) {
        data.activities[0].actor = data.members[0].email;
        data.activities[0].message = "ActivityLongWord".repeat(40);
      }
      localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
    }, longName);
    await page.reload();
    const card = page.locator(".portfolio-card").filter({ hasText: longName });
    await expect(card).toHaveCount(1);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.querySelector<HTMLElement>(".app-shell")!.dataset.fontScale =
          "large";
      }, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const clipped = await card
        .locator("h2, :scope > small, :scope > p, .portfolio-meta")
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => ({
              tag: element.tagName,
              text: element.textContent?.slice(0, 60),
            })),
        );
      expect(clipped).toEqual([]);
      expect(
        await card.evaluate(
          (element) => element.scrollWidth > element.clientWidth + 1,
        ),
      ).toBe(false);
      const heading = (await card.locator("h2").boundingBox())!;
      const summary = (await card.locator(":scope > p").boundingBox())!;
      expect(heading.y + heading.height).toBeLessThanOrEqual(summary.y + 1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    }
    await card.click();
    await expect(page.locator("main h1")).toContainText(longName);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    for (const section of ["activity", "settings"]) {
      await page.goto(`/demo?section=${section}`);
      await page
        .locator(section === "activity" ? ".activity-row" : ".settings-detail")
        .first()
        .waitFor();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      const clipped = await page
        .locator(
          section === "activity" ? ".activity-row p" : ".settings-detail",
        )
        .evaluateAll((elements) =>
          elements.some(
            (element) => element.scrollWidth > element.clientWidth + 1,
          ),
        );
      expect(clipped).toBe(false);
    }
  });
}
