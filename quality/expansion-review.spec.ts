import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("restored custom filters show the selected field and standard clear action", async ({
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
  const option = crypto.randomUUID();
  await page.route("**/api/board-room/project-template", (route) =>
    route.fulfill({
      json: {
        version: 1,
        publishedRevision: 1,
        revision: 1,
        definition: {
          fields: [
            {
              key: "review_flag",
              label: "Review flag",
              guidance: "",
              required: false,
              active: true,
              options: [{ id: option, label: "Ready", active: true }],
            },
          ],
        },
        values: {},
        pendingUpdate: false,
      },
    }),
  );
  await page.goto("/board-room?section=projects");
  await expect(
    page.getByRole("combobox", { name: "Custom metadata field filter" }),
  ).toBeVisible();
  await page.evaluate(
    ({ option }) => {
      history.pushState(
        null,
        "",
        "/board-room?section=projects&customField=review_flag&customOption=" +
          option,
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    { option },
  );
  await expect(
    page.getByRole("combobox", { name: "Custom metadata field filter" }),
  ).toHaveAttribute("data-value", "review_flag");
  await expect(
    page.getByRole("combobox", { name: "Custom metadata option filter" }),
  ).toHaveAttribute("data-value", option);
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page).not.toHaveURL(/customOption=/);
});
