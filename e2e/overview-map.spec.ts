import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`Overview embeds a usable paginated connection map at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo?section=overview");
    const overview = page.getByRole("region", {
      name: "Connection overview",
      exact: true,
    });
    await expect(overview.locator(".connection-node").first()).toBeVisible();
    await overview
      .getByRole("combobox", { name: "Overview connection label", exact: true })
      .click();
    await page.getByRole("option", { name: "#design", exact: true }).click();
    await expect(
      overview.locator('[data-anchor="label:design"]'),
    ).toContainText("#design");
    await expect(page.locator("main h1")).toHaveText("Overview");
    await overview
      .getByRole("button", { name: "Fit map", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const task = overview.getByRole("button", {
      name: "Open task: Refine the homepage experience",
      exact: true,
    });
    if (!(await task.count())) {
      await overview
        .locator('.connection-node-shell[data-kind="task"]')
        .filter({ hasText: "Refine the homepage experience" })
        .click();
    }
    await task.click();
    await expect(
      page.getByRole("region", { name: "Task editor", exact: true }),
    ).toBeVisible();
  });
}

test("Overview connection selector and map traverse more than one page without hiding results", async ({
  page,
}) => {
  await page.goto("/demo?section=overview");
  await page.locator(".dashboard-page").waitFor();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    const source = d.projects[0];
    for (let i = 0; i < 30; i++)
      d.projects.push({
        ...source,
        id: crypto.randomUUID(),
        name: `Map project ${i}`,
        labels: [`aa_${String(i).padStart(2, "0")}`],
      });
    source.labels = ["zz_many"];
    d.tasks = Array.from({ length: 30 }, (_, i) => ({
      ...d.tasks[0],
      id: crypto.randomUUID(),
      title: `Map task ${i}`,
      projectId: source.id,
      archived: false,
    }));
    localStorage.setItem("evolve-demo-v1", JSON.stringify(d));
  });
  await page.reload();
  const overview = page.getByRole("region", {
    name: "Connection overview",
    exact: true,
  });
  await overview
    .getByRole("button", { name: "Next overview labels", exact: true })
    .click();
  await overview
    .getByRole("combobox", { name: "Overview connection label", exact: true })
    .click();
  await page.getByRole("option", { name: "#zz_many", exact: true }).click();
  await expect(overview.locator(".overview-map-count")).toContainText("31");
  await overview
    .getByRole("button", { name: "Next overview connections", exact: true })
    .click();
  await expect(overview.locator('[data-anchor="label:zz_many"]')).toBeVisible();
  await expect(
    overview.locator('.connection-node-shell[data-kind="task"]'),
  ).toHaveCount(12);
});
