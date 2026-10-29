import { test, expect, type BrowserContext, type Page } from "@playwright/test";
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
function editor(page: Page) {
  return page.getByRole("region", { name: "Task editor", exact: true });
}
function taskMutation(page: Page, action: "createTask" | "updateTask") {
  return page.waitForResponse((response) => {
    const request = response.request();
    return (
      response.url().endsWith("/api/workspace") &&
      request.method() === "POST" &&
      request.postDataJSON()?.action === action
    );
  });
}

test("task date ranges validate, persist, edit and duplicate through the authenticated workspace", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app?section=tasks&view=list");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = editor(page);
  await form
    .getByLabel("Task title", { exact: true })
    .fill("Range persistence acceptance");
  await form.getByLabel("Start date", { exact: true }).fill("2026-10-25");
  await form.getByLabel("Due date", { exact: true }).fill("2026-10-24");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByLabel("Due date", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(form.getByRole("alert")).toContainText(
    "End date must be on or after start date.",
  );
  await form.getByLabel("Start date", { exact: true }).fill("2026-10-21");
  await expect(form.getByLabel("Due date", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await form.getByLabel("Due date", { exact: true }).fill("2026-10-25");
  const creating = taskMutation(page, "createTask");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  const createdResponse = await creating;
  expect(createdResponse.ok()).toBeTruthy();
  const created = (await createdResponse.json()).task;
  expect(created.startDate).toBe("2026-10-21");
  expect(created.dueDate).toBe("2026-10-25");
  await expect(form).toHaveCount(0);
  const row = page.locator(".task-row").filter({ hasText: created.title });
  await expect(
    row.locator('.task-date-range time[datetime="2026-10-21"]'),
  ).toBeVisible();
  await expect(
    row.locator('.task-date-range time[datetime="2026-10-25"]'),
  ).toBeVisible();
  await page.goto(`/app?task=${created.id}`);
  await expect(form.getByLabel("Start date", { exact: true })).toHaveValue(
    "2026-10-21",
  );
  await expect(form.getByLabel("Due date", { exact: true })).toHaveValue(
    "2026-10-25",
  );
  await form.getByLabel("Due date", { exact: true }).fill("2026-10-26");
  const updating = taskMutation(page, "updateTask");
  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await updating).ok()).toBeTruthy();
  await page.goto(`/app?task=${created.id}`);
  await expect(form.getByLabel("Start date", { exact: true })).toHaveValue(
    "2026-10-21",
  );
  await expect(form.getByLabel("Due date", { exact: true })).toHaveValue(
    "2026-10-26",
  );
  await page.keyboard.press("Escape");
  await page.goto("/app?section=tasks&view=list");
  await page
    .getByRole("button", { name: `Actions for ${created.title}`, exact: true })
    .click();
  const duplicating = taskMutation(page, "createTask");
  await page
    .getByRole("menuitem", { name: "Duplicate task", exact: true })
    .click();
  const duplicateResponse = await duplicating;
  expect(duplicateResponse.ok()).toBeTruthy();
  const duplicate = (await duplicateResponse.json()).task;
  expect(duplicate.startDate).toBe("2026-10-21");
  expect(duplicate.dueDate).toBe("2026-10-26");
  expect(duplicate.id).not.toBe(created.id);
});

test("a date-range draft survives reload and a missing end date is explained", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/demo?section=tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = editor(page);
  await form
    .getByLabel("Task title", { exact: true })
    .fill("Retained range draft");
  await form.getByLabel("Start date", { exact: true }).fill("2026-12-30");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "Choose an end date when a start date is set.",
  );
  await expect(form.getByLabel("Due date", { exact: true })).toBeFocused();
  await form.getByLabel("Due date", { exact: true }).fill("2027-01-02");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await form
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(form.getByLabel("Task title", { exact: true })).toHaveValue(
    "Retained range draft",
  );
  await expect(form.getByLabel("Start date", { exact: true })).toHaveValue(
    "2026-12-30",
  );
  await expect(form.getByLabel("Due date", { exact: true })).toHaveValue(
    "2027-01-02",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await form
    .getByRole("button", { name: "Clear due date", exact: true })
    .click();
  await expect(form.getByLabel("Start date", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("Due date", { exact: true })).toHaveValue("");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`a range crossing the calendar window remains visible on its active days at ${width}px`, async ({
    context,
    page,
  }) => {
    await signIn(context);
    await page.clock.install({ time: new Date("2026-10-31T12:00:00Z") });
    await page.setViewportSize({ width, height: 900 });
    const response = await page.request.post("/api/workspace", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        action: "createTask",
        task: {
          title: `Cross-month scheduled work ${width}`,
          startDate: "2026-10-30",
          dueDate: "2026-11-02",
        },
      },
    });
    expect(response.ok()).toBeTruthy();
    const task = (await response.json()).task;
    await page.goto("/app?section=tasks&view=calendar");
    const day = (key: string) =>
      page.locator(`.calendar-date-select:has(time[datetime="${key}"])`);
    await expect(day("2026-10-30")).toBeVisible();
    await expect(day("2026-10-30").locator(".calendar-day-count")).toHaveText(
      /[1-9]/,
    );
    if (width <= 850) {
      await day("2026-10-30").click();
      const agenda = page.locator(".calendar-agenda");
      await expect(
        agenda.getByRole("button", { name: task.title, exact: true }),
      ).toBeVisible();
      await expect(
        agenda.locator('.task-date-range time[datetime="2026-11-02"]'),
      ).toBeVisible();
      await agenda
        .getByRole("button", { name: task.title, exact: true })
        .click();
      await expect(
        editor(page).getByLabel("Start date", { exact: true }),
      ).toHaveValue("2026-10-30");
      await page.keyboard.press("Escape");
      await expect(day("2026-10-30")).toHaveAttribute("aria-pressed", "true");
    } else {
      const rangeItems = page
        .locator(".calendar-task-range")
        .filter({ hasText: task.title });
      await expect(rangeItems).toHaveCount(3);
      await expect(rangeItems.first()).toHaveAttribute(
        "data-range-position",
        "start",
      );
      await expect(rangeItems.last()).toHaveAttribute(
        "data-range-position",
        "middle",
      );
    }
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await expect(page.locator(".calendar-toolbar h2")).toHaveText(
      "November 2026",
    );
    await day("2026-11-02").click();
    if (width <= 850) {
      await expect(
        page
          .locator(".calendar-agenda")
          .getByRole("button", { name: task.title, exact: true }),
      ).toBeVisible();
      await day("2026-11-03").click();
      await expect(
        page
          .locator(".calendar-agenda")
          .getByRole("button", { name: task.title, exact: true }),
      ).toHaveCount(0);
    } else {
      const end = day("2026-11-02")
        .locator("xpath=../..")
        .locator(".calendar-task-range")
        .filter({ hasText: task.title });
      await expect(end).toHaveAttribute("data-range-position", "end");
      await expect(
        day("2026-11-03")
          .locator("xpath=../..")
          .getByRole("button", { name: task.title, exact: true }),
      ).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("bulk date ranges validate every selected task and clearing the deadline clears its whole schedule", async ({
  context,
  page,
}) => {
  await signIn(context);
  for (const [title, startDate, dueDate] of [
    ["Bulk date range first", "2026-10-10", "2026-10-15"],
    ["Bulk date range second", "2026-10-20", "2026-10-25"],
  ]) {
    const response = await page.request.post("/api/workspace", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        action: "createTask",
        task: {
          title,
          startDate,
          dueDate,
          dueTime: "12:30",
          dueTimeZone: "Asia/Jakarta",
        },
      },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto("/app?section=tasks&view=list");
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("Bulk date range");
  await expect(page.locator(".task-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Bulk edit", exact: true }).click();
  const bulk = page.getByRole("dialog", {
    name: "Edit tasks together",
    exact: true,
  });
  await bulk
    .getByRole("checkbox", { name: "Select the first 2 tasks", exact: true })
    .check();
  await bulk
    .getByRole("checkbox", { name: "Change deadline", exact: true })
    .check();
  await bulk.getByLabel("Due date", { exact: true }).fill("2026-10-18");
  let mutations = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/workspace") &&
      request.method() === "POST" &&
      request.postDataJSON()?.action === "bulkUpdateTasks"
    )
      mutations++;
  });
  await bulk
    .getByRole("button", { name: "Apply to 2 tasks", exact: true })
    .click();
  await expect(bulk.getByRole("alert")).toContainText(
    "Bulk date range second: End date must be on or after start date.",
  );
  expect(mutations).toBe(0);
  const unchanged = await page.request.get("/api/tasks?q=Bulk%20date%20range");
  expect(
    (await unchanged.json()).tasks
      .map((task: { dueDate: string }) => task.dueDate)
      .sort(),
  ).toEqual(["2026-10-15", "2026-10-25"]);
  await bulk
    .getByRole("checkbox", { name: "Change start date", exact: true })
    .check();
  await bulk.getByLabel("Start date", { exact: true }).fill("2026-10-12");
  await bulk
    .getByRole("button", { name: "Apply to 2 tasks", exact: true })
    .click();
  await expect(bulk).toHaveCount(0);
  const changed = await page.request.get("/api/tasks?q=Bulk%20date%20range");
  const tasks = (await changed.json()).tasks;
  expect(tasks).toHaveLength(2);
  expect(
    tasks.every(
      (task: { startDate: string; dueDate: string }) =>
        task.startDate === "2026-10-12" && task.dueDate === "2026-10-18",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Bulk edit", exact: true }).click();
  await bulk
    .getByRole("checkbox", { name: "Select the first 2 tasks", exact: true })
    .check();
  await bulk
    .getByRole("checkbox", { name: "Change deadline", exact: true })
    .check();
  await bulk
    .getByRole("button", { name: "Apply to 2 tasks", exact: true })
    .click();
  await expect(bulk).toHaveCount(0);
  const cleared = await page.request.get("/api/tasks?q=Bulk%20date%20range");
  expect(
    (await cleared.json()).tasks.every(
      (task: {
        startDate: string | null;
        dueDate: string | null;
        dueTime: string | null;
      }) =>
        task.startDate === null &&
        task.dueDate === null &&
        task.dueTime === null,
    ),
  ).toBe(true);
});
