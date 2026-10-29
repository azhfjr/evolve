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
async function project(page: Page) {
  const r = await page.request.post("/api/board-room", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: {
        externalId: `REPAIR-${crypto.randomUUID()}`,
        name: "ABC repair project",
      },
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).project;
}
async function hold(page: Page, path: string, action: string, body: object) {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  await page.route(path, async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === action
    ) {
      entered();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else await route.continue();
  });
  return { release, started };
}
test("Board review fields cannot lose edits during a pending save", async ({
  page,
  context,
}) => {
  await signIn(context);
  const p = await project(page);
  await page.goto(`/board-room/projects/${p.id}`);
  const note = page.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  await note.fill("Submitted review");
  const pending = await hold(page, "**/api/board-room", "reviewProgress", {
    project: p,
  });
  try {
    await page
      .getByRole("button", { name: "Confirm progress reviewed", exact: true })
      .click();
    await pending.started;
    await expect(note).toBeDisabled();
    await page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Document review note", exact: true }),
    ).toBeDisabled();
  } finally {
    pending.release();
  }
});
test("Board project fields stay locked until a save finishes", async ({
  page,
  context,
}) => {
  await signIn(context);
  const p = await project(page);
  await page.goto(`/board-room/projects/${p.id}`);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Project name", exact: true });
  await name.fill("Submitted project");
  const pending = await hold(page, "**/api/board-room", "saveProject", {
    project: p,
  });
  try {
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await pending.started;
    await expect(name).toBeDisabled();
  } finally {
    pending.release();
  }
});
test("Locker saved view name stays locked during a save", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app?section=tasks");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const name = page.getByRole("textbox", {
    name: "Save current view",
    exact: true,
  });
  await name.fill("Submitted view");
  const pending = await hold(page, "**/api/workspace", "createSavedView", {});
  try {
    await page.getByRole("button", { name: "Save view", exact: true }).click();
    await pending.started;
    await expect(name).toBeDisabled();
  } finally {
    pending.release();
  }
});
test("closing Board details requires an explicit decision about review notes", async ({
  page,
  context,
}) => {
  await signIn(context);
  const p = await project(page);
  await page.goto(`/board-room/projects/${p.id}`);
  const note = page.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  await note.fill("Unsaved progress evidence");
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Document review note", exact: true })
    .fill("Unsaved document evidence");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Discard unsaved review notes?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect(note).toHaveValue("Unsaved progress evidence");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard notes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("CSV platform errors explain the recovery action without JSON parser text", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/board-room?section=database");
  await page
    .getByRole("button", { name: "Import projects", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Import project CSV" });
  await dialog.getByLabel("Choose project CSV").setInputFiles({
    name: "error.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("RUPTL Code,Project name\nERROR-1,Example"),
  });
  await page.route("**/api/board-room", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 413,
          contentType: "text/plain",
          body: "FUNCTION_PAYLOAD_TOO_LARGE",
        })
      : route.continue(),
  );
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Split");
  await expect(dialog.getByRole("alert")).not.toContainText("JSON");
});
test("oversized encoded CSV requests are rejected before a network import", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/board-room?section=database");
  await page
    .getByRole("button", { name: "Import projects", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Import project CSV" });
  let sent = 0;
  await page.route("**/api/board-room", (route) => {
    if (route.request().method() === "POST") {
      sent++;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Request should not be sent" }),
      });
    }
    return route.continue();
  });
  const source =
    "RUPTL Code,Project name,Description\n" +
    Array.from(
      { length: 5000 },
      (_, i) => `CHECK-${i},Example,${"a".repeat(1000)}`,
    ).join("\n");
  await dialog.getByLabel("Choose project CSV").setInputFiles({
    name: "large.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(source),
  });
  await expect(dialog.getByRole("alert")).toContainText("4 MiB");
  expect(sent).toBe(0);
});

test("reload warns about an unsaved review and canceling preserves it", async ({
  page,
  context,
}) => {
  await signIn(context);
  const p = await project(page);
  await page.goto(`/board-room/projects/${p.id}`);
  const note = page.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  await note.click();
  await note.fill("Keep this review when reload is canceled");
  let warned = false;
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("beforeunload");
    warned = true;
    await dialog.dismiss();
  });
  await page.reload({ timeout: 3000 }).catch((error) => {
    // A canceled native reload can leave Playwright waiting for a load that will never occur.
    if (!warned || !/aborted|ERR_ABORTED|Timeout/.test(String(error)))
      throw error;
  });
  expect(warned).toBe(true);
  await expect(note).toHaveValue("Keep this review when reload is canceled");
});
