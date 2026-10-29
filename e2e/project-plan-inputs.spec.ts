import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";

test("project COD choices and draft recovery remain available without Locker financial inputs", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await d
    .getByLabel("Project name", { exact: true })
    .fill("COD planning draft");
  const cod = d.getByLabel("Planned COD", { exact: true });
  await cod.click();
  await expect(page.getByRole("option")).toHaveCount(16);
  await page.getByRole("option", { name: "2040", exact: true }).click();
  await d.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(cod).toHaveAttribute("data-value", "2040");
  await expect(d.getByLabel("Project name", { exact: true })).toHaveValue(
    "COD planning draft",
  );
  await d.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(d).toHaveCount(0);
});

async function signIn(context: BrowserContext) {
  const sessions = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: sessions["e2e-admin"],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("authenticated project COD and options persist through create, reload and explicit clearing", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const d = page.getByRole("dialog");
  const name = `COD round trip ${crypto.randomUUID().slice(0, 8)}`;
  await d.getByLabel("Project name", { exact: true }).fill(name);
  await selectOption(d.getByLabel("Planned COD", { exact: true }), "2030");
  await expect(d.getByLabel("Amount", { exact: true })).toHaveCount(0);
  const creation = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/workspace") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON().action === "createProject",
  );
  await d.getByRole("button", { name: "Create project", exact: true }).click();
  const response = await creation;
  expect(response.ok()).toBe(true);
  const project = (await response.json()).project;
  expect(project.plannedCodYear).toBe(2030);
  expect(project.costOptions).toEqual([]);
  await expect(d).toHaveCount(0);
  await page.goto(`/app?section=project&project=${project.id}`);
  await expect(page.locator(".project-cod-badge")).toHaveText(
    "Planned COD 2030",
  );
  await page.reload();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(d.getByLabel("Planned COD", { exact: true })).toHaveAttribute(
    "data-value",
    "2030",
  );
  await selectOption(d.getByLabel("Planned COD", { exact: true }), {
    label: "Not set",
  });
  const saving = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/workspace") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON().action === "updateProject",
  );
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  const saved = await saving;
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).project.plannedCodYear).toBeNull();
  await expect(d).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".project-cod-badge")).toHaveCount(0);
  const data = await (await page.request.get("/api/workspace")).json();
  const stored = data.projects.find((p: { id: string }) => p.id === project.id);
  expect(stored.plannedCodYear).toBeNull();
  expect(stored.costOptions).toEqual(project.costOptions);
});

test("unchanged legacy zero-cost draft replays the original project receipt", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app?section=projects");
  const { projectFields } = await import("../src/lib/project-model");
  const fields = projectFields.parse({
    name: `Lost response ${crypto.randomUUID().slice(0, 8)}`,
    currency: "USD",
    budget: "0.00",
    costOptions: [],
    costItems: [],
  });
  const request = {
    id: crypto.randomUUID(),
    fingerprint: JSON.stringify(fields),
  };
  const creation = await page.request.post("/api/workspace", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { action: "createProject", ...fields, idempotencyKey: request.id },
  });
  expect(creation.ok()).toBe(true);
  const original = (await creation.json()).project;
  await page.evaluate(
    ({ fields, request }) =>
      sessionStorage.setItem(
        "evolve-project-draft-v1:workspace:jarjirjor777@gmail.com",
        JSON.stringify({
          savedAt: Date.now(),
          draft: { fields: { ...fields, plannedCodYear: null }, request },
        }),
      ),
    { fields, request },
  );
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const replay = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/workspace") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON().action === "createProject",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const response = await replay;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().idempotencyKey).toBe(request.id);
  expect((await response.json()).project.id).toBe(original.id);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await (await page.request.get("/api/workspace")).json();
  expect(
    data.projects.filter((p: { name: string }) => p.name === fields.name),
  ).toHaveLength(1);
});
