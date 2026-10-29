import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
test("an unsaved progress note survives remote stage saves and failed review requests", async ({
  page,
  context,
}) => {
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
  const response = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: {
        externalId: `NOTE-DRAFT-${Date.now()}`,
        name: "Review note preservation",
        documentChecklist: [{ label: "Planning evidence", checked: false }],
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { project } = await response.json();
  await page.goto(`/board-room/projects/${project.id}`);
  const dialog = page.getByRole("dialog");
  const note = dialog.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  const draft =
    "Confirming the yearly plan with the project team; keep this draft.";
  await note.fill(draft);
  const updated = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "progress",
      id: project.id,
      version: project.version,
      stage: 2,
      reason: "Reviewed the remote stage change with the project team.",
    },
  });
  expect(updated.ok()).toBeTruthy();
  await expect(dialog.locator(".br-stage-track button").nth(1)).toHaveClass(
    "current",
  );
  await expect(note).toHaveValue(draft);
  await page.route("**/api/board-room", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "reviewProgress"
    )
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary review failure" }),
      });
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Confirm progress reviewed", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Temporary review failure",
  );
  await expect(note).toHaveValue(draft);
  await page.unroute("**/api/board-room");
  await dialog
    .getByRole("button", { name: "Confirm progress reviewed", exact: true })
    .click();
  await expect(note).toHaveValue("");
  await expect(dialog.locator(".br-review-note")).toHaveText(draft);
  await page.reload();
  await expect(dialog.locator(".br-review-note")).toHaveText(draft);
});
