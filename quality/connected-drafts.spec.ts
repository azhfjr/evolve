import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
test.beforeEach(async ({ context }) => {
  const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: tokens["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
test("recovered project drafts retain their original version and protect remote figures", async ({
  page,
}) => {
  const response = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: {
        externalId: `DRAFT-${crypto.randomUUID()}`,
        name: "Draft conflict project",
        category: "Pembangkit",
        capacity: 10,
        unit: "MW",
      },
    },
  });
  expect(response.ok()).toBe(true);
  const { project } = await response.json();
  await page.goto(`/board-room/projects/${project.id}`);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Local recovered project");
  await expect(
    page.getByText("Draft saved on this browser", { exact: true }),
  ).toBeVisible();
  const update = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      id: project.id,
      version: project.version,
      values: {
        externalId: project.externalId,
        name: project.name,
        category: "Pembangkit",
        capacity: 99,
        unit: "MW",
      },
    },
  });
  expect(update.ok()).toBe(true);
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    /changed|conflict|newer/i,
  );
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Local recovered project",
  );
  expect(
    (await (await page.request.get(`/api/board-room?id=${project.id}`)).json())
      .project.capacity,
  ).toBe(99);
});
test("recovered asset drafts retain their original version", async ({
  page,
}) => {
  const values = {
    code: `DRAFT-${crypto.randomUUID()}`,
    name: "Draft asset",
    category: "Pembangkit",
    capacity: 10,
    unit: "MW",
    location: "Kalimantan Timur",
    voltage: "150 kV",
    projectId: null,
  };
  const response = await page.request.post("/api/board-room/assets", {
    headers: { origin },
    data: { action: "save", values },
  });
  expect(response.ok()).toBe(true);
  const { asset } = await response.json();
  await page.goto(`/board-room?section=assets&asset=${asset.id}`);
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Local recovered asset");
  await expect(
    page.getByText("Draft saved on this browser", { exact: true }),
  ).toBeVisible();
  const update = await page.request.post("/api/board-room/assets", {
    headers: { origin },
    data: {
      action: "save",
      id: asset.id,
      version: asset.version,
      values: { ...values, capacity: 99 },
    },
  });
  expect(update.ok()).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await page.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    /changed|conflict|newer/i,
  );
  await expect(page.getByLabel("Asset name", { exact: true })).toHaveValue(
    "Local recovered asset",
  );
});
test("existing task drafts survive reload with their original conflict version", async ({
  page,
}) => {
  const data = await (await page.request.get("/api/workspace")).json();
  const response = await page.request.post("/api/workspace", {
    headers: { origin },
    data: {
      action: "createTask",
      task: { title: "Task recovery fixture", projectId: data.projects[0].id },
    },
  });
  expect(response.ok()).toBe(true);
  const { task } = await response.json();
  await page.goto(`/app?section=tasks&task=${task.id}`);
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Local recovered task");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          Object.keys(localStorage).filter(
            (k) => k.startsWith("evolve-task-draft-") && k.includes(id),
          ).length,
        task.id,
      ),
    )
    .toBe(1);
  const update = await page.request.post("/api/workspace", {
    headers: { origin },
    data: {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { title: "Remote task title" },
    },
  });
  expect(update.ok()).toBe(true);
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await page.getByLabel("Task title", { exact: true }).press("Control+Enter");
  await expect(
    page
      .getByRole("region", { name: "Task editor", exact: true })
      .getByRole("alert"),
  ).toContainText(/changed|conflict|newer|diubah/i);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    "Local recovered task",
  );
});
