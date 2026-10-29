import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function nav(page: Page, label: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
}
for (const width of [320, 390, 768])
  test(`login and navigation prioritize the user action at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    const google = page.getByRole("button", {
      name: "Continue with Google",
      exact: true,
    });
    const bounds = await google.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(740);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.goto("/demo");
    await expect(page.locator("main h1")).toHaveText("Overview");
    if (width === 768)
      expect((await page.locator(".main-shell").boundingBox())!.x).toBe(72);
    await nav(page, "All tasks");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const editor = page.getByRole("region", {
      name: "Task editor",
      exact: true,
    });
    await expect(
      page
        .locator("main")
        .getByRole("region", { name: "Task editor", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      editor.getByLabel("Task title", { exact: true }),
    ).toBeFocused();
    const save = await editor
      .getByRole("button", { name: "Create task", exact: true })
      .boundingBox();
    expect(save!.y + save!.height).toBeLessThanOrEqual(740);
    await page.screenshot({ path: `test-results/native-editor-${width}.png` });
  });
test("task page protects edits across browser Back, cancel, sidebar navigation and save", async ({
  page,
}) => {
  await page.goto("/demo?section=tasks");
  const row = page.locator(".task-name").first();
  const title = await row.innerText();
  await row.click();
  const editor = page.getByRole("region", { name: "Task editor", exact: true });
  const taskUrl = page.url();
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Protected native page change");
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await expect(page).toHaveURL(taskUrl);
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    "Protected native page change",
  );
  await nav(page, "Projects");
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Projects");
  await page.goBack();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    title,
  );
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Saved native page change");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Saved native page change", exact: true }),
  ).toBeVisible();
});
test("creation page reload restores context and draft while pickers support keyboard and Escape", async ({
  page,
}) => {
  await page.goto("/demo?section=mytasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const editor = page.getByRole("region", { name: "Task editor", exact: true });
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Draft on a real workspace page");
  const priority = editor.getByLabel("Priority", { exact: true });
  await priority.focus();
  await priority.press("ArrowDown");
  const menuScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    menuScan.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.keyboard.press("h");
  await expect(
    page.getByRole("option", { name: "High", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(priority).toHaveAttribute("data-value", "high");
  await priority.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(priority).toBeFocused();
  await page.reload();
  await editor
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    "Draft on a real workspace page",
  );
  await expect(editor.getByLabel("Assignee", { exact: true })).toHaveAttribute(
    "data-value",
    "alex@example.com",
  );
  await expect(priority).toHaveAttribute("data-value", "high");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
test("project creation recovers incomplete values after close/reload and editing requires a discard decision", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Project name", { exact: true })
    .fill("A recoverable project plan");
  await modal
    .getByLabel("Description", { exact: true })
    .fill("Recover the project context");
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(modal.getByLabel("Project name", { exact: true })).toHaveValue(
    "A recoverable project plan",
  );
  await expect(
    modal.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Recover the project context");
  await expect(modal.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await modal
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .locator(".portfolio-card")
    .filter({ hasText: "A recoverable project plan" })
    .click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await modal
    .getByLabel("Project name", { exact: true })
    .fill("Changes needing a decision");
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Discard project changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(modal.getByLabel("Project name", { exact: true })).toHaveValue(
    "Changes needing a decision",
  );
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.locator("main h1")).toContainText(
    "A recoverable project plan",
  );
  await nav(page, "Projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(modal.getByLabel("Project name", { exact: true })).toHaveValue(
    "",
  );
});
test("signing out requires an explicit decision before clearing a task draft", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Keep this draft until I choose to leave");
  await page.locator(".profile-button").click();
  await page.getByRole("menuitem", { name: "Leave demo", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    "Keep this draft until I choose to leave",
  );
  await page.locator(".profile-button").click();
  await page.getByRole("menuitem", { name: "Leave demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((k) =>
        k.startsWith("evolve-task-draft-v1:demo:"),
      ),
    ),
  ).toBe(false);
});
test("Quick find protects existing edits and retains a creation draft when switching tasks", async ({
  page,
}) => {
  await page.goto("/demo?section=tasks");
  const firstTitle = await page.locator(".task-name").first().innerText();
  const targetTitle = await page.locator(".task-name").nth(1).innerText();
  await page.locator(".task-name").first().click();
  const editor = page.getByRole("region", { name: "Task editor", exact: true });
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("An edit protected during search");
  const find = async () => {
    await page.locator(".sidebar-search").click();
    const search = page.getByRole("combobox", {
      name: "Search all tasks",
      exact: true,
    });
    await search.fill(targetTitle);
    await search.press("Enter");
  };
  await find();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    "An edit protected during search",
  );
  await find();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    targetTitle,
  );
  await page.goBack();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    firstTitle,
  );
  await editor
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("A creation draft retained during search");
  await find();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    targetTitle,
  );
  await page.goBack();
  await editor
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    "A creation draft retained during search",
  );
});
