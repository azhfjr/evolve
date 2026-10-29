import {
  test,
  expect,
  type BrowserContext,
  type Locator,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";

async function editChip(dialog: Locator, before: string, after: string) {
  await dialog
    .getByRole("button", { name: `Edit label ${before}`, exact: true })
    .click();
  const name = dialog.getByRole("textbox", {
    name: "Rename label",
    exact: true,
  });
  await expect(name).toBeFocused();
  await name.fill(after);
  await name.press("Enter");
  await expect(name).toHaveCount(0);
}
async function signIn(context: BrowserContext, actor = "e2e-admin") {
  const sessions = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: sessions[actor],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

for (const [section, width] of [
  ["overview", 1440],
  ["connection", 390],
] as const) {
  test(`${section} edits a project label in place, keeps other labels, and follows its renamed map at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/demo?section=${section}&label=design`);
    const map = page.getByRole("region", {
      name:
        section === "overview"
          ? "Connection overview"
          : "Workspace connections",
      exact: true,
    });
    if (section === "overview")
      await selectOption(
        map.getByRole("combobox", {
          name: "Overview connection label",
          exact: true,
        }),
        "design",
      );
    if (section === "overview") {
      await map
        .getByRole("button", { name: "Enter fullscreen", exact: true })
        .click();
    }
    const surface =
      section === "overview"
        ? page.getByRole("dialog", {
            name: "Connection fullscreen",
            exact: true,
          })
        : map;
    await surface
      .locator('.connection-node-shell[data-kind="project"] .connection-node')
      .filter({ hasText: "Website redesign" })
      .hover();
    await surface
      .getByRole("button", {
        name: "Edit labels for Website redesign",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Edit connection labels",
      exact: true,
    });
    await expect(
      page.getByRole("dialog", { name: "Connection fullscreen", exact: true }),
    ).toHaveCount(0);
    if (section === "overview")
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement === null))
        .toBe(true);
    await editChip(dialog, "design", "#Delivery Planning");
    await expect(
      dialog.getByRole("button", {
        name: "Remove label delivery_planning",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Remove label ux", exact: true }),
    ).toBeVisible();
    // Cancelling a rename retains the chip and unrelated new-label input.
    await dialog
      .getByLabel("Project labels", { exact: true })
      .fill("draft_search");
    await dialog
      .getByRole("button", { name: "Edit label ux", exact: true })
      .click();
    await dialog
      .getByRole("textbox", { name: "Rename label", exact: true })
      .fill("not_saved");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Project labels", { exact: true }),
    ).toHaveValue("draft_search");
    await dialog.getByLabel("Project labels", { exact: true }).fill("");
    await dialog
      .getByRole("button", { name: "Save labels", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      map.locator('[data-anchor="label:delivery_planning"]'),
    ).toBeVisible();
    await expect(
      map.locator('.connection-node-shell[data-kind="project"]'),
    ).toHaveCount(1);
    await page.reload();
    if (section === "overview")
      await selectOption(
        map.getByRole("combobox", {
          name: "Overview connection label",
          exact: true,
        }),
        "delivery_planning",
      );
    await expect(
      map.locator('[data-anchor="label:delivery_planning"]'),
    ).toBeVisible();
    const openTask = map.getByRole("button", {
      name: "Open task: Refine the homepage experience",
      exact: true,
    });
    if ((await openTask.count()) === 0) {
      await map
        .locator('.connection-node-shell[data-kind="task"] .connection-node')
        .filter({ hasText: "Refine the homepage experience" })
        .click();
    }
    await openTask.click();
    await expect(page.locator(".inherited-project-labels")).toContainText(
      "#delivery_planning",
    );
    await expect(page.locator(".inherited-project-labels")).toContainText(
      "#ux",
    );
  });
}

test("a concurrent label edit keeps the draft on conflict and saves after explicit reload with inherited task labels", async ({
  context,
  page,
}) => {
  await signIn(context);
  const suffix = crypto.randomUUID().slice(0, 8);
  const original = `edit_before_${suffix}`,
    current = `edit_current_${suffix}`,
    final = `edit_after_${suffix}`;
  const projectResponse = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "createProject",
      name: `Label conflict ${suffix}`,
      labels: [original, "keep_this"],
    },
  });
  expect(projectResponse.ok()).toBe(true);
  const project = (await projectResponse.json()).project;
  const taskResponse = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "createTask",
      task: { title: `Inherited labels ${suffix}`, projectId: project.id },
    },
  });
  expect(taskResponse.ok()).toBe(true);
  const task = (await taskResponse.json()).task;
  await page.goto(`/app?section=connection&label=${original}`);
  const map = page.getByRole("region", {
    name: "Workspace connections",
    exact: true,
  });
  await map
    .locator('.connection-node-shell[data-kind="project"] .connection-node')
    .filter({ hasText: project.name })
    .hover();
  await map
    .getByRole("button", {
      name: `Edit labels for ${project.name}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit connection labels",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: `Edit label ${original}`, exact: true }),
  ).toBeVisible();
  await editChip(dialog, original, final);
  const concurrent = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "updateConnectionLabels",
      kind: "project",
      id: project.id,
      version: project.version,
      labels: [current, "keep_this"],
    },
  });
  expect(concurrent.ok()).toBe(true);
  await dialog
    .getByRole("button", { name: "Save labels", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed while you were editing",
  );
  await expect(
    dialog.getByRole("button", { name: `Remove label ${final}`, exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Reload current labels", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: `Edit label ${current}`, exact: true }),
  ).toBeVisible();
  await editChip(dialog, current, final);
  await dialog
    .getByRole("button", { name: "Save labels", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(map.locator(`[data-anchor="label:${final}"]`)).toBeVisible();
  const workspace = await (await page.request.get("/api/workspace")).json();
  expect(
    workspace.projects.find((item: { id: string }) => item.id === project.id)
      .labels,
  ).toEqual([final, "keep_this"]);
  const storedTask = await (
    await page.request.get(`/api/tasks/${task.id}`)
  ).json();
  expect(storedTask.task.labels).toEqual([final, "keep_this"]);
});

test("merging a renamed label follows its explicit target and preserves the third label", async ({
  page,
}) => {
  await page.goto("/demo?section=connection&label=ux");
  await page
    .getByRole("region", { name: "Workspace connections", exact: true })
    .waitFor();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
    data.projects.find(
      (p: { name: string }) => p.name === "Website redesign",
    ).labels = ["design", "ux", "planning"];
    localStorage.setItem("evolve-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  const map = page.getByRole("region", {
    name: "Workspace connections",
    exact: true,
  });
  await map
    .locator('.connection-node-shell[data-kind="project"] .connection-node')
    .filter({ hasText: "Website redesign" })
    .hover();
  await map
    .getByRole("button", {
      name: "Edit labels for Website redesign",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit connection labels",
    exact: true,
  });
  await editChip(dialog, "ux", "design");
  await expect(
    dialog.getByRole("button", { name: "Remove label planning", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Save labels", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(map.locator('[data-anchor="label:design"]')).toBeVisible();
  await expect(map.locator('[data-anchor="label:planning"]')).toHaveCount(0);
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("evolve-demo-v1")!).projects.find(
        (p: { name: string }) => p.name === "Website redesign",
      ).labels,
  );
  expect(stored).toEqual(["design", "planning"]);
});
