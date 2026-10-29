import {
  historicalProject,
  historicalCosts,
} from "./historical-project-fixture";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";
const origin = "http://127.0.0.1:3100";
async function signIn(context: BrowserContext, role = "e2e-admin") {
  const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth[role],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function camera(map: import("@playwright/test").Locator) {
  return map.evaluate((element) => ({
    x: Number((element as HTMLElement).dataset.cameraX),
    y: Number((element as HTMLElement).dataset.cameraY),
    zoom: Number((element as HTMLElement).dataset.cameraZoom),
  }));
}

async function nav(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}

test("project hashtags connect inherited tasks while historical costs stay read-only", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await signIn(context);
  await page.goto("/app?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Connected cost plan");
  await dialog
    .getByLabel("Project labels", { exact: true })
    .fill("Energy planning");
  await dialog.getByLabel("Project labels", { exact: true }).press("Enter");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const createdWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  const createdProject = createdWorkspace.projects.find(
    (project: { name: string }) => project.name === "Connected cost plan",
  );
  expect(createdProject.labels).toEqual(["energy_planning"]);
  Object.assign(
    createdProject,
    await historicalCosts(createdProject.id, {
      name: createdProject.name,
      budget: "1250000.50",
      currency: "USD",
    }),
  );
  await nav(page, "All tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const editor = page.getByRole("region", { name: "Task editor", exact: true });
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Review the connected plan");
  await selectOption(editor.getByLabel("Project", { exact: true }), {
    label: "Connected cost plan",
  });
  await expect(editor.locator(".inherited-project-labels")).toContainText(
    "#energy_planning",
  );
  await expect(
    editor.getByRole("textbox", { name: "Labels", exact: true }),
  ).toHaveCount(0);
  await editor
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await nav(page, "Connection");
  await page
    .getByLabel("Search connection labels", { exact: true })
    .fill("#energy_planning");
  await page
    .locator(".connection-label-list button")
    .filter({ hasText: "#energy_planning" })
    .click();
  await expect(page.locator(".connection-node")).toHaveCount(3);
  await expect(page.locator(".connection-kind")).toHaveCount(0);
  await expect(
    page.locator('.connection-node-shell[data-kind="label"]'),
  ).toHaveCount(1);
  await expect(page.locator(".connection-map-tools")).toContainText(
    "#energy_planning",
  );
  await expect(page.locator(".connection-lines path")).toHaveCount(2);
  await expect(
    page.locator('.connection-lines path[data-target^="task:"]'),
  ).toHaveAttribute("data-source", `project:${createdProject.id}`);
  await expect(
    page.getByRole("button", {
      name: "Edit labels for Review the connected plan",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Open project: Connected cost plan",
      exact: true,
    })
    .click();
  await expect(page.locator("main h1")).toContainText("Connected cost plan");
  await expect(
    page.locator(
      '.cost-option-summary .cost-option-totals strong[data-unit="USD"]',
    ),
  ).toHaveText("$1,250,000.50");
  await page
    .locator(".project-connection-labels")
    .getByRole("button", { name: "#energy_planning", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Open task: Review the connected plan",
      exact: true,
    })
    .click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue(
    "Review the connected plan",
  );
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Protected connection edit");
  await nav(page, "Connection");
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByLabel("Search connection labels", { exact: true })
    .fill("energy_planning");
  await page
    .locator(".connection-label-list button")
    .filter({ hasText: "#energy_planning" })
    .click();
  await page
    .getByRole("button", {
      name: "Open project: Connected cost plan",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Remove label energy_planning", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await nav(page, "Connection");
  await page
    .getByLabel("Search connection labels", { exact: true })
    .fill("energy_planning");
  await expect(
    page
      .locator(".connection-label-list button")
      .filter({ hasText: "#energy_planning" }),
  ).toHaveCount(0);
  await expect(page.locator(".connection-node")).toHaveCount(0);
  await page.reload();
  const persistedWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  const persistedProject = persistedWorkspace.projects.find(
    (project: { id: string }) => project.id === createdProject.id,
  );
  expect(persistedProject.labels).toEqual([]);
  expect(persistedProject.budget).toBe(createdProject.budget);
  expect(persistedProject.costItems).toEqual(createdProject.costItems);
  expect(persistedProject.costOptions).toEqual(createdProject.costOptions);
  const persistedTask = persistedWorkspace.tasks.find(
    (task: { title: string }) => task.title === "Review the connected plan",
  );
  expect(persistedTask.projectId).toBe(createdProject.id);
  const taskConnection = await page.request.get(
    `/api/connections/item?kind=task&id=${persistedTask.id}`,
  );
  expect(taskConnection.ok()).toBeTruthy();
  expect((await taskConnection.json()).labels).toEqual([]);
});

for (const width of [1440, 390, 320])
  test(`Connection supports keyboard, map controls and accessible reflow at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo");
    await page
      .getByRole("button", { name: "Explore #design connections", exact: true })
      .click();
    await expect(page.locator("main h1")).toHaveText("Connection");
    expect(
      (await page.locator(".page-header").boundingBox())!.height,
    ).toBeLessThan(200);
    await expect(
      page.locator('.connection-node-shell[data-kind="label"]'),
    ).toHaveCount(1);
    await expect(page.locator(".connection-map-tools")).toContainText(
      "#design",
    );
    await expect(page.locator(".connection-kind")).toHaveCount(0);
    await expect(
      page.locator(".connection-lines path").first(),
    ).toHaveAttribute("d", /^M/);
    const map = page.getByRole("region", {
      name: "Connection map. Drag to pan, scroll to zoom, or use arrow keys.",
      exact: true,
    });
    await page.getByRole("button", { name: "Fit map", exact: true }).click();
    const fitted = await camera(map);
    expect(fitted.zoom).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect
      .poll(async () => (await camera(map)).zoom)
      .toBeCloseTo(fitted.zoom * 1.2, 5);
    await page.getByRole("button", { name: "Fit map", exact: true }).click();
    await expect.poll(() => camera(map)).toEqual(fitted);
    await map.focus();
    await map.press("ArrowDown");
    await expect.poll(async () => (await camera(map)).y).not.toBe(fitted.y);
    await map.press("Home");
    await expect.poll(() => camera(map)).toEqual(fitted);
    await page.getByRole("tab", { name: "Map", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "List", exact: true }),
    ).toBeFocused();
    await expect(page.locator(".connection-item-list li")).not.toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(
      page.getByRole("tab", { name: "Map", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/connection-${width}.png`,
      fullPage: true,
    });
  });

test("Locker restores unsubmitted labels without exposing retired financial input", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Native project draft");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await dialog
    .getByLabel("Project labels", { exact: true })
    .fill("Unsubmitted label");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Remove label unsubmitted_label",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveCount(0);
});

test("Connection API requires membership, and its loading failure can be retried", async ({
  page,
  context,
}) => {
  const anonymous = await page.request.get("/api/connections");
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["cache-control"]).toBe("private, no-store");
  await signIn(context, "e2e-outsider");
  expect((await page.request.get("/api/connections")).status()).toBe(403);
  await signIn(context);
  const projectResponse = await page.request.post("/api/workspace", {
    headers: { origin },
    data: {
      action: "createProject",
      name: "Connection retry project",
      labels: ["Retry map"],
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const retryProject = (await projectResponse.json()).project;
  expect(retryProject.labels).toEqual(["retry_map"]);
  const taskResponse = await page.request.post("/api/workspace", {
    headers: { origin },
    data: {
      action: "createTask",
      task: { title: "Connection retry fixture", projectId: retryProject.id },
    },
  });
  expect(taskResponse.ok()).toBeTruthy();
  let unavailable = true;
  await page.route("**/api/connections?**", async (route) => {
    if (unavailable) {
      await route.fulfill({
        status: 503,
        json: { error: "Connection service unavailable" },
      });
    } else await route.continue();
  });
  await page.goto("/app?section=connection");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Connection service unavailable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try again", exact: true })
    .click({ trial: true });
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page
      .locator(".connection-label-list button")
      .filter({ hasText: "#retry_map" }),
  ).toBeVisible();
});

test("sidebar scroll controls reveal management without moving the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/demo");
  const navArea = page.locator(".sidebar-scroll-area nav");
  const before = await navArea.evaluate((e) => e.scrollTop);
  await page
    .getByRole("button", { name: "Scroll navigation down", exact: true })
    .click();
  await expect
    .poll(() => navArea.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page
    .getByRole("button", { name: "Scroll navigation up", exact: true })
    .click();
  await expect
    .poll(() => navArea.evaluate((e) => e.scrollTop))
    .toBeLessThan(180);
});

test("large connection graphs pan, fit filtered work and edit labels without overwriting project cost", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await signIn(context);
  const original = await historicalProject(page, {
    action: "createProject",
    name: "Map edit cost fixture",
    description: "Keep the original",
    color: "green",
    budget: "5432.10",
    currency: "USD",
    labels: ["Map editing fixture"],
  });
  expect(original.labels).toEqual(["map_editing_fixture"]);
  const batch = Array.from({ length: 18 }, (_, i) => ({
    title: `Map edit task ${i}`,
    projectId: original.id,
  }));
  // Sequential commands respect workspace CAS and avoid synthetic server-side fixtures.
  for (const task of batch)
    expect(
      (
        await page.request.post("/api/workspace", {
          headers: { origin },
          data: { action: "createTask", task },
        })
      ).ok(),
    ).toBeTruthy();
  await page.goto("/app?section=connection");
  await page
    .getByLabel("Search connection labels", { exact: true })
    .fill("map_editing_fixture");
  await page
    .locator(".connection-label-list button")
    .filter({ hasText: "#map_editing_fixture" })
    .click();
  await expect(page.locator(".connection-node")).toHaveCount(20);
  await expect(page.locator(".connection-kind")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Edit labels for Map edit task / }),
  ).toHaveCount(0);
  const map = page.locator(".connection-viewport");
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const initialFit = await camera(map);
  await expect(page.locator(".connection-lines path")).toHaveCount(19);
  await map.focus();
  await map.press("End");
  await expect.poll(async () => (await camera(map)).y).not.toBe(initialFit.y);
  await map.press("Home");
  await expect.poll(() => camera(map)).toEqual(initialFit);
  await map.evaluate((element) =>
    element.setAttribute("data-preserved-view", "true"),
  );
  await page
    .getByRole("button", {
      name: "Edit labels for Map edit cost fixture",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit connection labels",
    exact: true,
  });
  await dialog
    .getByLabel("Project labels", { exact: true })
    .fill("Map secondary label");
  await dialog
    .getByRole("button", { name: "Save labels", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(map).toHaveAttribute("data-preserved-view", "true");
  const persisted = await page.request.get(
    `/api/connections/item?kind=project&id=${original.id}`,
  );
  expect(persisted.ok()).toBeTruthy();
  expect((await persisted.json()).labels).toEqual([
    "map_editing_fixture",
    "map_secondary_label",
  ]);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const project = workspace.projects.find(
    (p: { id: string }) => p.id === original.id,
  );
  expect(project.budget).toBe(original.budget);
  expect(project.costItems).toEqual(original.costItems);
  expect(project.costOptions).toEqual(original.costOptions);
  expect(project.description).toBe(original.description);
  const inheritedTask = workspace.tasks.find(
    (task: { title: string }) => task.title === "Map edit task 0",
  );
  const inherited = await page.request.get(
    `/api/connections/item?kind=task&id=${inheritedTask.id}`,
  );
  expect(inherited.ok()).toBeTruthy();
  expect((await inherited.json()).labels).toEqual(project.labels);
  await page
    .getByLabel("Search linked items", { exact: true })
    .fill("Map edit cost fixture");
  await expect(page.locator(".connection-node")).toHaveCount(2);
  await expect(page.locator(".connection-lines path")).toHaveCount(1);
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expect
    .poll(async () => (await camera(map)).zoom)
    .toBeGreaterThan(initialFit.zoom);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  const filteredFit = await camera(map);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await camera(map)).zoom)
    .toBeCloseTo(filteredFit.zoom * 1.2, 5);

  await page
    .getByLabel("Search linked items", { exact: true })
    .fill("Map edit task 0");
  await expect(
    page.locator('.connection-node-shell[data-kind="task"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.connection-node-shell[data-kind="project"]'),
  ).toHaveCount(1);
  await expect(page.locator(".connection-detail-heading")).toContainText(
    "1 linked items",
  );
  await expect(page.locator(".connection-lines path")).toHaveCount(2);
  await expect(
    page.locator('.connection-lines path[data-target^="task:"]'),
  ).toHaveAttribute("data-source", `project:${original.id}`);
  await expect(
    page.locator('.connection-lines path[data-target^="task:"]'),
  ).toHaveAttribute("data-target", `task:${inheritedTask.id}`);
  await selectOption(
    page.getByLabel("Connection item type", { exact: true }),
    "task",
  );
  await expect(
    page.locator('.connection-node-shell[data-kind="task"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.connection-node-shell[data-kind="project"]'),
  ).toHaveCount(1);
  await expect(page.locator(".connection-detail-heading")).toContainText(
    "1 linked items",
  );
  await page
    .getByRole("button", { name: "Open task: Map edit task 0", exact: true })
    .focus();
  await expect(page.locator(".connection-map-selection")).toContainText(
    "Map edit task 0",
  );
  await expect(
    page.locator(
      `.connection-node-shell[data-anchor="project:${original.id}"]`,
    ),
  ).toHaveAttribute("data-highlighted", "true");
  await expect(
    page.locator('.connection-lines path[data-target^="task:"]'),
  ).toHaveAttribute("data-highlighted", "true");
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.locator(".connection-item-list li")).toHaveCount(1);
  await expect(page.locator(".connection-item-list")).toContainText(
    "Map edit task 0",
  );
  await expect(
    page
      .locator(".connection-item-list")
      .getByRole("button", { name: /Map edit cost fixture/ }),
  ).toHaveCount(0);
});
