import { selectOption } from "./ui-helpers";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
test("Board admin reviews accountable progress and project evidence; members remain read-only", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  const response = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: {
        externalId: `CONTROL-E2E-${Date.now()}`,
        name: "Accountable project review",
        category: "Pembangkit",
        capacity: 10,
        unit: "MW",
        startYear: 2027,
        codYear: 2031,
        location: "Kalimantan Timur",
        scope: "Generation",
        voltage: "150 kV",
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { project } = await response.json();
  await page.goto(`/board-room/projects/${project.id}`);
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Edit project", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Responsible contact", exact: true })
    .fill("Kalimantan planning team");
  await expect(
    dialog.getByRole("textbox", { name: /Required documents/ }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: /^(Save|Create) project$/, exact: true })
    .click();
  await expect(
    dialog.getByText("Kalimantan planning team", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: "Set Accountable project review to stage 5: Stage 5",
      exact: true,
    })
    .click();
  await expect(dialog.locator(".br-stage-track button").nth(4)).not.toHaveClass(
    "current",
  );
  await dialog
    .getByRole("textbox", { name: "Reason for stage jump", exact: true })
    .fill("Confirmed the imported workflow baseline with the project team.");
  await dialog
    .getByRole("button", { name: "Apply stage change", exact: true })
    .click();
  await expect(dialog.locator(".br-stage-track button").nth(4)).toHaveClass(
    "current",
  );
  await dialog
    .getByRole("textbox", { name: "Progress review note", exact: true })
    .fill("Current stage and 2031 COD confirmed.");
  await dialog
    .getByRole("button", { name: "Confirm progress reviewed", exact: true })
    .click();
  await expect(dialog.locator(".br-attention-badge")).toHaveText("Reviewed");
  const reviewed = (
    await (await page.request.get(`/api/board-room?id=${project.id}`)).json()
  ).project;
  expect(reviewed.progressReviewedAt).toBeTruthy();
  await dialog
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await selectOption(dialog.getByLabel("Upload document purpose"), "Reference");
  await dialog.getByLabel("Upload project document").setInputFiles({
    name: "required-study.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Approved study for disposable Board review fixture"),
  });
  await expect(
    dialog.getByRole("link", { name: "required-study.txt", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Document review note", exact: true })
    .fill("Approved study checked against the project scope.");
  await dialog
    .getByRole("button", { name: "Mark project valid", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Revoke validity", exact: true }),
  ).toBeVisible();
  await page.reload();
  dialog = page.getByRole("dialog");
  await expect(
    dialog
      .getByText("Approved study checked against the project scope.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  const after = (
    await (await page.request.get(`/api/board-room?id=${project.id}`)).json()
  ).project;
  expect(after.progressReviewedAt).toBe(reviewed.progressReviewedAt);
  expect(after.valid).toBe(true);
  await dialog
    .getByRole("button", { name: "Revoke validity", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Mark project valid", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("heading", { name: "Progress review", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const latest = (
    await (await page.request.get(`/api/board-room?id=${project.id}`)).json()
  ).project;
  const completed = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "progress",
      id: project.id,
      version: latest.version,
      stage: 10,
      completed: true,
      reason: "Completion verified for the disposable test project.",
    },
  });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".br-attention-badge")).toHaveText(
    "Completed · not reviewed",
  );
  const memberContext = await browser.newContext();
  try {
    await signIn(memberContext, "e2e-member");
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/board-room/projects/${project.id}`);
    await expect(
      memberPage.getByRole("button", {
        name: "Confirm progress reviewed",
        exact: true,
      }),
    ).toHaveCount(0);
    await memberPage
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await expect(
      memberPage.getByRole("button", {
        name: "Mark project valid",
        exact: true,
      }),
    ).toHaveCount(0);
    const denied = await memberPage.request.post("/api/board-room", {
      headers: { origin },
      data: {
        action: "reviewProgress",
        id: project.id,
        version: after.version,
        note: "Forbidden",
      },
    });
    expect(denied.status()).toBe(403);
  } finally {
    await memberContext.close();
  }
});
