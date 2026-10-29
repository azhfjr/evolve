import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("stage reasons are enforced through API and CSV review controls", async ({
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
  const origin = "http://127.0.0.1:3100",
    code = `STRICT-E2E-${Date.now()}`;
  const created = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: { externalId: code, name: "Strict stage policy" },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { project } = await created.json();
  const rejected = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "progress",
      id: project.id,
      version: project.version,
      stage: 5,
    },
  });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error).toMatch(/reason/i);
  await page.goto("/board-room?section=database");
  await page
    .getByRole("button", { name: "Import projects", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Import project CSV" });
  await dialog.getByLabel(/Legacy CSV mode/).check();
  await dialog.getByLabel("Choose project CSV").setInputFiles({
    name: "stages.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`RUPTL Code,Current stage\n${code},5`),
  });
  await dialog
    .getByLabel("Update existing stages and completion from this CSV")
    .check();
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Provide a reason");
  const note =
    "Reviewed the imported baseline with the responsible planning team.";
  await dialog
    .getByRole("textbox", { name: "Reason for CSV stage updates", exact: true })
    .fill(note);
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    dialog.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const detail = await (
    await page.request.get(`/api/board-room?id=${project.id}`)
  ).json();
  expect(detail.project.stage).toBe(5);
  expect(
    detail.history.some(
      (h: { kind: string; detail: { reason?: string } }) =>
        h.kind === "csv_import" && h.detail.reason === note,
    ),
  ).toBeTruthy();
});
