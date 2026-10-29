import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "UTC" });

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const width of [320, 390, 768, 1440]) {
  test(`calendar, journal and settings use available space at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo?section=tasks&view=calendar");
    await page.locator(".calendar-days").waitFor();
    await page.waitForFunction(() => localStorage.getItem("evolve-demo-v1"));
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
      const now = new Date();
      const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const base = data.tasks[0];
      data.tasks = Array.from({ length: 6 }, (_, index) => ({
        ...base,
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        title: `Scheduled task ${index + 1}`,
        dueDate,
        status: "todo",
        archived: false,
      }));
      localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
    });
    await page.reload();
    const dates = page.locator(".calendar-date-select");
    await expect(dates.first()).toBeVisible();
    expect(await dates.count()).toBeGreaterThanOrEqual(28);
    expect(await dates.count()).toBeLessThanOrEqual(42);
    const firstWeek = await dates.evaluateAll((elements) =>
      elements.slice(0, 7).map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, right: rect.right, y: rect.y, height: rect.height };
      }),
    );
    expect(firstWeek[0].x).toBeGreaterThanOrEqual(0);
    expect(firstWeek[6].right).toBeLessThanOrEqual(width);
    expect(new Set(firstWeek.map((rect) => Math.round(rect.y))).size).toBe(1);
    expect(Math.max(...firstWeek.map((rect) => rect.height))).toBeLessThan(70);
    const today = page.locator('.calendar-date-select[aria-current="date"]');
    await today.focus();
    await page.keyboard.press("Enter");
    await expect(today).toHaveAttribute("aria-pressed", "true");
    if (width <= 850) {
      const agenda = page.locator(".calendar-agenda");
      await expect(agenda.locator("li")).toHaveCount(6);
      await agenda
        .getByRole("button", { name: "Scheduled task 6", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: "+2 more", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Scheduled task 6", exact: true })
        .click();
    }
    await expect(
      page.getByRole("textbox", { name: "Task title", exact: true }),
    ).toHaveValue("Scheduled task 6");
    await page.keyboard.press("Escape");
    const heading = await page.locator(".calendar-toolbar h2").textContent();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await expect(page.locator(".calendar-toolbar h2")).not.toHaveText(heading!);
    await page
      .getByRole("button", { name: "Previous month", exact: true })
      .click();
    await expect(today).toBeVisible();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(today).toHaveAttribute("aria-pressed", "true");
    const selectedKey = await today.locator("time").getAttribute("datetime");
    const selectedLabel = await today.getAttribute("aria-label");
    await page
      .getByRole("button", {
        name: `Add task for ${selectedLabel}`,
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue(
      selectedKey!,
    );
    await page.keyboard.press("Escape");
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.querySelector<HTMLElement>(".app-shell")!.dataset.fontScale =
          "large";
      }, theme);
      await noPageOverflow(page);
      await expect(dates.nth(6)).toBeInViewport({ ratio: 1 });
    }

    for (const section of ["activity", "settings"]) {
      await page.goto(`/demo?section=${section}`);
      await page
        .locator(
          section === "activity" ? ".activity-controls" : ".settings-detail",
        )
        .waitFor();
      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          document.querySelector<HTMLElement>(".app-shell")!.dataset.fontScale =
            "large";
        }, theme);
        await noPageOverflow(page);
      }
      if (section === "activity") {
        const count = await page.locator(".activity-row").count();
        expect(count).toBeGreaterThan(0);
        const selection = page.getByRole("checkbox", {
          name: "Select all loaded activities",
          exact: true,
        });
        await selection.check();
        const remove = page.getByRole("button", {
          name: "Delete selected",
          exact: true,
        });
        await remove.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(remove).toBeFocused();
        await expect(page.locator(".activity-row")).toHaveCount(count);
      } else {
        const panel = (await page.locator(".settings-detail").boundingBox())!;
        const form = (await page
          .locator(".settings-detail > .standard-form")
          .boundingBox())!;
        expect(form.width / panel.width).toBeGreaterThan(0.8);
      }
    }
  });
}

test("task and project names share proportional columns without clipping", async ({
  page,
}) => {
  await page.goto("/demo?section=tasks&view=list");
  await page.locator(".task-row").first().waitFor();
  const title =
    "Review transmission protection coordination for the regional delivery programme";
  const project =
    "Regional transmission protection coordination delivery programme and detailed design".slice(
      0,
      80,
    );
  await page.evaluate(
    ({ title, project }) => {
      const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
      data.projects[0].name = project;
      data.tasks = [
        {
          ...data.tasks[0],
          title,
          projectId: data.projects[0].id,
          checklist: [],
          status: "todo",
          archived: false,
        },
      ];
      localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
    },
    { title, project },
  );
  await page.reload();
  const row = page.locator(".task-row").first();
  await expect(row.locator(".task-name")).toHaveText(title);
  await expect(row.locator(".task-project-name")).toHaveText(project);
  const identity = (await row.locator(".task-name-cell").boundingBox())!;
  const reference = (await row.locator(".task-project").boundingBox())!;
  expect(identity.width / reference.width).toBeLessThan(1.25);
  expect(reference.x - identity.x - identity.width).toBeLessThanOrEqual(10);
  for (const selector of [".task-name", ".task-project-name"]) {
    expect(
      await row
        .locator(selector)
        .evaluate(
          (element) =>
            element.scrollHeight <= element.clientHeight + 1 &&
            element.scrollWidth <= element.clientWidth + 1,
        ),
    ).toBe(true);
  }
  await row
    .getByRole("button", { name: `Actions for ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Duplicate task", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    row.getByRole("button", { name: `Actions for ${title}`, exact: true }),
  ).toBeFocused();
});

test("account calendar crosses midnight and month boundary before the UTC browser", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.clock.install({ time: new Date("2026-10-31T18:30:00Z") });
  await page.goto("/demo?section=tasks&view=calendar");
  await page.locator(".calendar-days").waitFor();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    data.profile.timeZone = "Asia/Jakarta";
    data.tasks = [
      {
        ...data.tasks[0],
        title: "New month account deadline",
        dueDate: "2026-11-01",
        status: "todo",
        archived: false,
      },
    ];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator(".calendar-toolbar h2")).toHaveText(
    "November 2026",
  );
  const today = page.locator('.calendar-date-select[aria-current="date"]');
  await expect(today).toHaveAccessibleName("Sunday, November 1, 2026");
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".calendar-agenda li")).toHaveText(
    "New month account deadline",
  );
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(page.locator(".calendar-toolbar h2")).toHaveText("October 2026");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".calendar-toolbar h2")).toHaveText(
    "November 2026",
  );
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Add task for Sunday, November 1, 2026",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue(
    "2026-11-01",
  );
});

test("phone agenda retains the selected date after closing its task editor", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/demo?section=tasks&view=calendar");
  await page.locator(".calendar-days").waitFor();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    const base = data.tasks[0];
    data.profile.timeZone = "Asia/Jakarta";
    data.tasks = [
      {
        ...base,
        title: "October agenda review",
        dueDate: "2026-10-23",
        status: "todo",
        archived: false,
      },
      {
        ...base,
        id: "10000000-0000-4000-8000-000000000099",
        title: "November agenda review",
        dueDate: "2026-11-23",
        status: "todo",
        archived: false,
      },
    ];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  for (const { date, title, month, close } of [
    {
      date: "Friday, October 23, 2026",
      title: "October agenda review",
      month: "October 2026",
      close: "back",
    },
    {
      date: "Monday, November 23, 2026",
      title: "November agenda review",
      month: "November 2026",
      close: "escape",
    },
  ]) {
    if (month === "November 2026")
      await page
        .getByRole("button", { name: "Next month", exact: true })
        .click();
    const selected = page.getByRole("button", { name: date, exact: true });
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await page
      .locator(".calendar-agenda")
      .getByRole("button", { name: title, exact: true })
      .click();
    const editor = page.getByRole("region", {
      name: "Task editor",
      exact: true,
    });
    await expect(
      editor.getByRole("textbox", { name: "Task title", exact: true }),
    ).toHaveValue(title);
    if (close === "back")
      await editor
        .getByRole("button", { name: "Back to workspace", exact: true })
        .click();
    else
      await editor
        .getByRole("textbox", { name: "Task title", exact: true })
        .press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".calendar-toolbar h2")).toHaveText(month);
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".calendar-agenda li")).toHaveCount(1);
    await expect(page.locator(".calendar-agenda li")).toHaveText(title);
  }
});
