import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";
async function signIn(context: BrowserContext, who = "e2e-admin") {
  const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: auth[who],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test("personal mapping reopens safely and committed batch appears without manual refresh", async ({
  page,
  context,
}) => {
  await signIn(context);
  const beforeImport = (
    await (await page.request.get("/api/board-room/imports")).json()
  ).batches[0]?.id;
  const code = `EVID-${Date.now()}`;
  const csv = {
    name: "yearly.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Ref,Title,Kind\n${code},Meeting evidence project,Pembangkit`,
    ),
  };
  await page.goto("/board-room?section=database");
  await page
    .getByRole("button", { name: "Import projects", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Import project CSV" });
  await dialog.getByLabel(/Legacy CSV mode/).check();
  await dialog.getByLabel("Choose project CSV").setInputFiles(csv);
  await selectOption(
    dialog.getByLabel("Map RUPTL Code", { exact: true }),
    "Ref",
  );
  await selectOption(
    dialog.getByLabel("Map Project name", { exact: true }),
    "Title",
  );
  await selectOption(
    dialog.getByLabel("Map Primary category", { exact: true }),
    "Kind",
  );
  await dialog.getByLabel("Personal mapping name").fill("Yearly meeting list");
  await dialog
    .getByRole("button", { name: "Save personal mapping", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Import projects", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Import project CSV" });
  await dialog.getByLabel(/Legacy CSV mode/).check();
  await dialog.getByLabel("Choose project CSV").setInputFiles(csv);
  await expect(
    dialog.getByRole("button", { name: "Apply saved mapping", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Apply saved mapping", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Map RUPTL Code", { exact: true }),
  ).toContainText("Ref");
  await expect(
    dialog.getByLabel("Update existing stages and completion from this CSV"),
  ).not.toBeChecked();
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    dialog.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  const refreshedHistory = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/board-room/imports" &&
      r.request().method() === "GET",
  );
  await dialog
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const committedHistory = await (await refreshedHistory).json();
  expect(committedHistory.batches[0].id).not.toBe(beforeImport);
  expect(committedHistory.batches[0].counts).toEqual({
    new: 1,
    updated: 0,
    unchanged: 0,
  });
  await expect(
    page
      .getByRole("region", { name: "CSV import history" })
      .getByRole("row")
      .nth(1)
      .getByText("1 new · 0 updated · 0 unchanged (1 rows)", { exact: true }),
  ).toBeVisible();
});
test("filtered portfolio reports preserve selected filters and are private HTML", async ({
  page,
  context,
}) => {
  await signIn(context, "e2e-member");
  await page.goto("/board-room?section=reports&category=Transmisi");
  const link = page.getByRole("link", {
    name: "Open portfolio report",
    exact: true,
  });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toContain("category=Transmisi");
  const report = await page.request.get(href!);
  expect(report.status()).toBe(200);
  expect(report.headers()["cache-control"]).toContain("no-store");
  expect(report.headers()["content-type"]).toContain("text/html");
  const html = await report.text();
  expect(html).toContain("category: Transmisi");
  expect(html).toContain("not a percentage of physical completion");
  expect(html).not.toContain("<script");
  const history = await page.request.get("/api/board-room/imports");
  expect(history.status()).toBe(200);
});
test("report and import journal require authentication", async ({
  request,
}) => {
  for (const route of ["/api/board-room/report", "/api/board-room/imports"])
    expect((await request.get(route)).status()).toBe(401);
});
