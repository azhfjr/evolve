import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
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
async function create(page: import("@playwright/test").Page) {
  const code = `GUARD-${crypto.randomUUID()}`;
  const r = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: { externalId: code, name: "Guarded navigation" },
    },
  });
  expect(r.ok()).toBe(true);
  return { project: (await r.json()).project, code };
}
test("connected-project navigation protects both review notes until explicitly discarded", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { project, code } = await create(page);
  const linked = await page.request.post("/api/workspace", {
    headers: { origin },
    data: {
      action: "createProject",
      name: "Connected guarded project",
      reference: code,
    },
  });
  expect(linked.ok()).toBe(true);
  await page.goto(`/board-room/projects/${project.id}`);
  const note = page.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  const document = page.getByRole("textbox", {
    name: "Document review note",
    exact: true,
  });
  await note.fill("Keep progress");
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await document.fill("Keep document");
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  const link = page
    .getByRole("region", { name: "Connected room projects" })
    .getByRole("link", { name: "Connected guarded project", exact: true });
  await link.click();
  await expect(
    page.getByRole("heading", {
      name: "Discard unsaved review notes?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(note).toHaveValue("Keep progress");
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await expect(document).toHaveValue("Keep document");
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await link.click();
  await page
    .getByRole("button", { name: "Discard notes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\?section=project/);
});
test("opening a shareable project page cannot silently discard a review", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { project } = await create(page);
  await page.goto(`/board-room/projects/${project.id}`);
  const note = page.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  await note.fill("Keep shareable draft");
  const link = page.getByRole("link", {
    name: "Open this project’s shareable page",
    exact: true,
  });
  await link.click();
  await expect(
    page.getByRole("heading", {
      name: "Discard unsaved review notes?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(note).toHaveValue("Keep shareable draft");
  await link.click();
  await page
    .getByRole("button", { name: "Discard notes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Progress review note", exact: true }),
  ).toHaveValue("");
});
test("applying a section-only view updates its URL and survives reload", async ({
  page,
  context,
}) => {
  await signIn(context);
  const r = await page.request.post("/api/board-room/views", {
    headers: { origin },
    data: {
      name: "Projects section only",
      filters: { query: {}, section: "projects", view: "table" },
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/board-room?section=overview");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply Projects section only", exact: true })
    .click();
  await expect(page).toHaveURL(/section=projects/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Project register", exact: true }),
  ).toBeVisible();
});
