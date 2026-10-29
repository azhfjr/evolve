import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Task, WorkspaceData } from "../src/lib/types";
import {
  connectionCursor,
  connectionQuerySchema,
  type ConnectionEntity,
} from "../src/lib/connection-model";

// These responses exercise the authenticated fetch path while remaining isolated
// from writes to the disposable database and from the workspace's first task page.
for (const surface of [
  {
    name: "Overview",
    section: "overview",
    region: "Connection overview",
    next: "Next overview connections",
    page: "dashboard",
  },
  {
    name: "Connection",
    section: "connection",
    region: "Workspace connections",
    next: "Next items",
    page: "connection",
  },
] as const) {
  test(`paging the ${surface.name} map cancels an old task open and allows the next page to open`, async ({
    context,
    page,
  }) => {
    const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: auth["e2e-member"],
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const response = await page.request.get("/api/workspace");
    expect(response.ok()).toBeTruthy();
    const workspace = (await response.json()) as WorkspaceData;
    expect(workspace.tasks.length).toBeGreaterThan(0);
    const baseTask = workspace.tasks[0];
    const firstTask: Task = {
      ...baseTask,
      id: "fa000000-0000-4000-8000-000000000001",
      title: "Deferred overview page one task",
      projectId: null,
      parentId: null,
      dependencies: [],
      status: "todo",
      archived: false,
    };
    const secondTask: Task = {
      ...firstTask,
      id: "fa000000-0000-4000-8000-000000000002",
      title: "Available overview page two task",
    };
    for (const task of [firstTask, secondTask])
      expect(workspace.tasks.some((item) => item.id === task.id)).toBe(false);
    const entity = (task: Task): ConnectionEntity => ({
      id: task.id,
      kind: "task",
      projectId: null,
      title: task.title,
      status: task.status,
      archived: false,
      version: task.version,
      labels: ["async_regression"],
    });
    await page.route("**/api/connections?**", async (route) => {
      const query = new URL(route.request().url()).searchParams;
      const body =
        query.get("mode") === "catalog"
          ? {
              groups: [
                {
                  key: "async_regression",
                  label: "async_regression",
                  projectCount: 0,
                  taskCount: 2,
                },
              ],
              total: 1,
              nextCursor: null,
            }
          : {
              items: [entity(query.has("cursor") ? secondTask : firstTask)],
              parents: [],
              total: 2,
              nextCursor: query.has("cursor")
                ? null
                : connectionCursor(
                    connectionQuerySchema.parse(Object.fromEntries(query)),
                    `task:${firstTask.id}`,
                  ),
            };
      await route.fulfill({ json: body });
    });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markRequested!: () => void;
    const firstRequested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    let markReleased!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      markReleased = resolve;
    });
    await page.route(`**/api/tasks/${firstTask.id}`, async (route) => {
      markRequested();
      await firstGate;
      try {
        await route.fulfill({ json: { task: firstTask } });
      } catch {
        // Expected when the fixed component aborts the old page's request.
      } finally {
        markReleased();
      }
    });
    await page.route(`**/api/tasks/${secondTask.id}`, (route) =>
      route.fulfill({ json: { task: secondTask } }),
    );
    try {
      await page.goto(`/app?section=${surface.section}&label=async_regression`);
      const map = page.getByRole("region", {
        name: surface.region,
        exact: true,
      });
      await map
        .getByRole("button", {
          name: `Open task: ${firstTask.title}`,
          exact: true,
        })
        .click();
      await firstRequested;
      await map
        .getByRole("button", { name: surface.next, exact: true })
        .click();
      const nextTask = map.getByRole("button", {
        name: `Open task: ${secondTask.title}`,
        exact: true,
      });
      await expect(nextTask).toBeVisible();
      releaseFirst();
      await firstReleased;
      // Waiting for the next node to become enabled also proves the aborted open
      // released the shared busy state; the old implementation opens page one.
      await expect(nextTask).toBeEnabled();
      await expect(
        page.getByRole("region", { name: "Task editor", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("#main-content")).toHaveAttribute(
        "data-page",
        surface.page,
      );
      await nextTask.click();
      const editor = page.getByRole("region", {
        name: "Task editor",
        exact: true,
      });
      await expect(editor).toBeVisible();
      await expect(
        editor.getByLabel("Task title", { exact: true }),
      ).toHaveValue(secondTask.title);
    } finally {
      releaseFirst();
    }
  });
}
