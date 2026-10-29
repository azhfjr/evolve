import { expect, test } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`Overview leads with daily work and exposes its map and seven charts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo?section=overview");
    const overview = page.locator(".overview-dashboard");
    const map = overview.getByRole("region", {
      name: "Connection overview",
      exact: true,
    });
    await expect(map).toBeVisible();
    await expect(
      overview.locator(".overview-analytics-grid > section"),
    ).toHaveCount(7);
    await expect(
      overview.getByText("Created vs completed", { exact: true }),
    ).toHaveCount(0);
    const mapBox = await map.boundingBox();
    const metricBox = await overview
      .locator(".dashboard-metrics")
      .boundingBox();
    expect(mapBox).not.toBeNull();
    expect(metricBox).not.toBeNull();
    expect(metricBox!.y + metricBox!.height).toBeLessThanOrEqual(mapBox!.y);
    const schedule = overview.locator(".overview-schedule");
    await expect(schedule.locator(".overview-schedule-day")).toHaveCount(14);
    await schedule.getByText("View data", { exact: false }).click();
    await expect(schedule.getByRole("table")).toBeVisible();
    await expect(schedule.getByRole("row")).toHaveCount(15);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const barBoxes = await schedule
      .locator(".overview-schedule-day")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width };
        }),
      );
    expect(
      barBoxes.every(
        (box) => box.left >= 0 && box.right <= width && box.width >= 24,
      ),
    ).toBe(true);
  });
}

test("scheduled day drilldowns include tasks spanning that date", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await page.goto("/demo?section=overview");
  await page.locator(".overview-schedule-day").first().waitFor();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    data.tasks = [
      {
        ...data.tasks[0],
        title: "A three-day delivery",
        status: "todo",
        archived: false,
        startDate: "2026-10-20",
        dueDate: "2026-10-22",
      },
    ];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  const days = page.locator(".overview-schedule-day");
  for (const index of [0, 1, 2])
    await expect(days.nth(index)).toHaveAttribute(
      "aria-label",
      /: 1 open scheduled tasks/,
    );
  await expect(days.nth(3)).toHaveAttribute(
    "aria-label",
    /: 0 open scheduled tasks/,
  );
  await days.nth(1).click();
  await expect(page).toHaveURL(/from=2026-10-21/);
  await expect(page).toHaveURL(/to=2026-10-21/);
  await expect(page).toHaveURL(/dateMode=overlap/);
  await expect(page).toHaveURL(/open=true/);
  await expect(
    page.locator(".task-row").filter({ hasText: "A three-day delivery" }),
  ).toHaveCount(1);
});

test("attention groups keep overlapping risks explicit and open-only", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await page.goto("/demo?section=overview");
  await page.locator(".overview-attention").waitFor();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    const base = data.tasks[0];
    data.tasks = [
      {
        ...base,
        title: "Late and ownerless",
        status: "todo",
        archived: false,
        assignee: null,
        dueDate: "2026-10-19",
      },
      {
        ...base,
        id: crypto.randomUUID(),
        title: "Unscheduled and ownerless",
        status: "todo",
        archived: false,
        assignee: null,
        dueDate: null,
      },
    ];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  const attention = page.locator(".overview-attention");
  await expect(attention).toContainText("groups may overlap");
  await expect(
    attention.getByRole("button", { name: /^Overdue work: 1 open tasks/ }),
  ).toBeVisible();
  const unassigned = attention.getByRole("button", {
    name: /^Without an owner: 2 open tasks/,
  });
  await expect(unassigned).toBeVisible();
  await expect(
    attention.getByRole("button", {
      name: /^Without a schedule: 1 open tasks/,
    }),
  ).toBeVisible();
  await unassigned.click();
  await expect(page).toHaveURL(/assignee=unassigned/);
  await expect(page).toHaveURL(/open=true/);
});
