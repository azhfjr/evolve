import { test, expect } from "@playwright/test";
for (const width of [390, 768, 1440])
  test(`historical large grouped costs remain read-only and readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo?section=projects");
    await page.locator(".portfolio-page").waitFor();
    const id = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
      const p = data.projects[0];
      p.costOptions = [
        {
          id: crypto.randomUUID(),
          title: "Historical equipment plan",
          items: [
            {
              id: crypto.randomUUID(),
              title: "Large historical equipment",
              unit: "USD",
              amount: "123456789012345678901234567890.12",
            },
          ],
        },
      ];
      localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
      return p.id;
    });
    await page.goto("/demo?section=project&project=" + id);
    await expect(
      page.getByText("Historical equipment plan", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manage costs", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.reload();
    await expect(
      page.getByText("Large historical equipment", { exact: true }),
    ).toBeVisible();
  });
