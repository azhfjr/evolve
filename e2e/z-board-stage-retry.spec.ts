import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("a failed stage change preserves its reason for retry", async ({
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
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: {
        externalId: `STAGE-RETRY-${Date.now()}`,
        name: "Stage reason recovery",
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { project } = await response.json();
  await page.goto(`/board-room/projects/${project.id}`);
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", {
      name: "Set Stage reason recovery to stage 5: Stage 5",
      exact: true,
    })
    .click();
  const reason = dialog.getByRole("textbox", {
    name: "Reason for stage jump",
    exact: true,
  });
  const draft =
    "Baseline confirmed with the project team; preserve this reason on failure.";
  await reason.fill(draft);
  await page.route("**/api/board-room", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "progress"
    )
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary stage failure" }),
      });
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Apply stage change", exact: true })
    .click();
  await expect(
    page.getByText("Temporary stage failure", { exact: true }),
  ).toBeVisible();
  await expect(reason).toHaveValue(draft);
  await page.unroute("**/api/board-room");
  await dialog
    .getByRole("button", { name: "Apply stage change", exact: true })
    .click();
  await expect(reason).toHaveCount(0);
  await expect(dialog.locator(".br-stage-track button").nth(4)).toHaveClass(
    "current",
  );
});
