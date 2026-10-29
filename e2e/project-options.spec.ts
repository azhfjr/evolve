import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("Locker project creation retains category and removes financial input", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByLabel("Project category", { exact: true })).toBeVisible();
  await expect(
    d.getByRole("button", { name: "Add option", exact: true }),
  ).toHaveCount(0);
  await expect(d.getByLabel("Cost title", { exact: true })).toHaveCount(0);
  await expect(
    d.getByText("Project costs are managed in Board Room."),
  ).toBeVisible();
});
test("deprecated Locker financial writes reject admin input", async ({
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
  const r = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "createProject",
      name: "Retired financial input",
      budget: "1.00",
      currency: "USD",
    },
  });
  expect(r.status()).toBe(410);
});
