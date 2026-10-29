import { test, expect, type Locator, type Page } from "@playwright/test";
import { editorSurface } from "./ui-helpers";

const projectName =
  "Regional transmission and protection coordination delivery programme phase one".padEnd(
    80,
    "X",
  );
const taskTitle = "Verify full project identity";

async function seedDemo(page: Page, view: "list" | "board") {
  await page.goto(`/demo?section=tasks&view=${view}`);
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem("evolve-demo-v1"));
  return page.evaluate(
    ({ projectName, taskTitle }) => {
      const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
      data.projects[0].name = projectName;
      data.projects[1].name = "P".repeat(80);
      const base = data.tasks[0];
      data.tasks = [
        { ...base, title: taskTitle, status: "todo", priority: "high" },
        {
          ...base,
          id: "10000000-0000-4000-8000-000000000002",
          title: "Unbroken project identity",
          projectId: data.projects[1].id,
          status: "todo",
        },
        {
          ...base,
          id: "10000000-0000-4000-8000-000000000003",
          title: "Independent task",
          projectId: null,
          status: "todo",
        },
        {
          ...base,
          id: "10000000-0000-4000-8000-000000000004",
          title: "Unresolved project task",
          projectId: "20000000-0000-4000-8000-000000000099",
          status: "todo",
        },
      ];
      data.profile.preferences.theme = "light";
      localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
      return { projectId: data.projects[0].id, taskId: base.id };
    },
    { projectName, taskTitle },
  );
}

async function assertUnclipped(reference: Locator, name: string) {
  await expect(reference).toHaveText(name);
  const metrics = await reference.evaluate(async (element) => {
    // Theme changes animate the row surface. Measure its settled contrast,
    // after the browser finishes those transitions rather than an intermediate frame.
    const transitions: Animation[] = [];
    let ancestor: Element | null = element;
    while (ancestor) {
      transitions.push(
        ...ancestor
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition),
      );
      ancestor = ancestor.parentElement;
    }
    await Promise.all(
      transitions.map((animation) => animation.finished.catch(() => undefined)),
    );
    const bounds = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const style = getComputedStyle(element);
    let surface: Element | null = element;
    while (
      surface.parentElement &&
      getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)"
    ) {
      surface = surface.parentElement;
    }
    const luminance = (color: string) => {
      const channels = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
      return channels.reduce((sum, channel, index) => {
        const value = channel / 255;
        return (
          sum +
          (value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][index]
        );
      }, 0);
    };
    const foreground = luminance(style.color);
    const background = luminance(getComputedStyle(surface).backgroundColor);
    return {
      contained:
        text.left >= bounds.left - 1 &&
        text.right <= bounds.right + 1 &&
        text.top >= bounds.top - 1 &&
        text.bottom <= bounds.bottom + 1,
      fits: element.scrollWidth <= element.clientWidth + 1,
      fontSize: Number.parseFloat(style.fontSize),
      contrast:
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
    };
  });
  expect(
    metrics.contained,
    "the full name must remain inside its visible box",
  ).toBe(true);
  expect(
    metrics.fits,
    "project identity must wrap instead of overflowing",
  ).toBe(true);
  expect(metrics.fontSize).toBeGreaterThanOrEqual(14);
  expect(
    metrics.contrast,
    "project text needs readable contrast on its surface",
  ).toBeGreaterThanOrEqual(4.5);
}

async function assertSeparate(elements: Locator) {
  const overlaps = await elements.evaluateAll((items) => {
    const boxes = items
      .filter((item) => item.getBoundingClientRect().width > 0)
      .map((item) => ({
        name: item.className,
        box: item.getBoundingClientRect(),
      }));
    return boxes.flatMap((a, index) =>
      boxes
        .slice(index + 1)
        .flatMap((b) =>
          Math.min(a.box.right, b.box.right) -
            Math.max(a.box.left, b.box.left) >
            1 &&
          Math.min(a.box.bottom, b.box.bottom) -
            Math.max(a.box.top, b.box.top) >
            1
            ? [`${a.name} overlaps ${b.name}`]
            : [],
        ),
    );
  });
  expect(overlaps).toEqual([]);
}

for (const width of [320, 390, 641, 700, 760, 1440]) {
  for (const view of ["list", "board"] as const) {
    test(`${view} exposes full project identity at ${width}px in light, dark and large text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await seedDemo(page, view);
      await page.reload();
      const item = page
        .locator(view === "list" ? ".task-row" : ".kanban-card")
        .filter({ hasText: taskTitle });
      const project = item.locator(
        view === "list" ? ".task-project" : ".project-tag",
      );
      await expect(item).toBeVisible();
      for (const appearance of ["light", "dark", "large"] as const) {
        await page.evaluate((appearance) => {
          document.documentElement.dataset.theme =
            appearance === "dark" ? "dark" : "light";
          document.querySelector<HTMLElement>(".app-shell")!.dataset.fontScale =
            appearance === "large" ? "large" : "standard";
        }, appearance);
        await assertUnclipped(project, projectName);
        await assertSeparate(
          item.locator(
            view === "list"
              ? ":scope > .task-name-cell, :scope > .task-project, :scope > .task-date, :scope > .task-priority, :scope > .task-assignee, :scope > .task-row-actions"
              : ".kanban-card-top > .project-tag, .kanban-card-top > .task-menu-button",
          ),
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        if (view === "list" && width > 760) {
          const alignment = await item.evaluate((row) => {
            const header = row
              .closest(".task-group")!
              .querySelector(".task-table-head")!;
            return [...row.children].every(
              (cell, index) =>
                Math.abs(
                  cell.getBoundingClientRect().left -
                    header.children[index].getBoundingClientRect().left,
                ) < 1,
            );
          });
          expect(alignment).toBe(true);
        }
      }
      const unbroken = page
        .locator(view === "list" ? ".task-row" : ".kanban-card")
        .filter({ hasText: "Unbroken project identity" });
      await assertUnclipped(
        unbroken.locator(view === "list" ? ".task-project" : ".project-tag"),
        "P".repeat(80),
      );
    });
  }
}

test("project references distinguish unassigned and unavailable projects in both views", async ({
  page,
}) => {
  await seedDemo(page, "list");
  await page.reload();
  for (const view of ["list", "board"] as const) {
    await page.goto(`/demo?section=tasks&view=${view}`);
    const items = page.locator(view === "list" ? ".task-row" : ".kanban-card");
    await expect(items.filter({ hasText: "Independent task" })).toContainText(
      "No project",
    );
    await expect(
      items.filter({ hasText: "Unresolved project task" }),
    ).toContainText("Project unavailable");
  }
});

test("project identity follows renames and remains present in project-specific tasks", async ({
  page,
}) => {
  const { projectId } = await seedDemo(page, "list");
  const renamed =
    "Renamed transmission delivery and protection coordination programme";
  await page.evaluate((renamed) => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    data.projects[0].name = renamed;
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  }, renamed);
  for (const view of ["list", "board"] as const) {
    await page.goto(`/demo?section=project&project=${projectId}&view=${view}`);
    const item = page
      .locator(view === "list" ? ".task-row" : ".kanban-card")
      .filter({ hasText: taskTitle });
    await assertUnclipped(
      item.locator(view === "list" ? ".task-project" : ".project-tag"),
      renamed,
    );
  }
});

test("task title and menu remain keyboard operable and board cards retain drag movement", async ({
  page,
}) => {
  await seedDemo(page, "list");
  await page.reload();
  const row = page.locator(".task-row").filter({ hasText: taskTitle });
  const title = row.getByRole("button", { name: taskTitle, exact: true });
  await title.focus();
  await page.keyboard.press("Enter");
  await expect(
    editorSurface(page).getByLabel("Task title", { exact: true }),
  ).toHaveValue(taskTitle);
  await page.goBack();
  await page.goto("/demo?section=tasks&view=board");
  const card = page.locator(".kanban-card").filter({ hasText: taskTitle });
  const actions = card.getByRole("button", {
    name: `Actions for ${taskTitle}`,
    exact: true,
  });
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  const target = page.locator(".kanban-column").filter({
    has: page.getByRole("heading", { name: "In progress", exact: true }),
  });
  await card.dragTo(target, {
    sourcePosition: { x: 5, y: 5 },
    targetPosition: { x: 20, y: 60 },
  });
  await expect(
    target.locator(".kanban-card").filter({ hasText: taskTitle }),
  ).toBeVisible();
});
