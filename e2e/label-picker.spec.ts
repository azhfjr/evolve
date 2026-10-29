import { expect, test, type BrowserContext } from "@playwright/test";
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

test("project labels browse without typing and support keyboard selection and canonical creation", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel("Project labels", { exact: true });
  await input.focus();
  const suggestions = dialog.getByRole("group", {
    name: "Existing connection labels",
    exact: true,
  });
  await expect(
    suggestions.getByRole("button", { name: "Use #design", exact: true }),
  ).toBeVisible();
  await input.press("ArrowDown");
  await expect(suggestions.getByRole("button").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".connection-label-chips > span")).toHaveCount(1);
  await input.fill(" #My New Label ");
  await expect(
    dialog.getByRole("button", { name: "Create #my_new_label", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create #my_new_label", exact: true })
    .click();
  await expect(input).toHaveValue("");
  await expect(
    dialog.getByRole("button", {
      name: "Remove label my_new_label",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Browse existing labels", exact: true })
    .click();
  await expect(suggestions).toBeVisible();
  await input.focus();
  await input.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await input.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("picker loads the global catalog with paging and selects existing labels without committing a partial query", async ({
  page,
  context,
}) => {
  await signIn(context);
  const queries: URL[] = [];
  await page.route("**/api/connections?**", async (route) => {
    const url = new URL(route.request().url());
    queries.push(url);
    const q = url.searchParams.get("q");
    const labels = q
      ? ["remote_design"]
      : url.searchParams.has("cursor")
        ? ["remote_design"]
        : ["catalog_first"];
    await route.fulfill({
      json: {
        groups: labels.map((label) => ({
          key: label,
          label,
          projectCount: 1,
          taskCount: 0,
        })),
        total: 2,
        nextCursor: !q && !url.searchParams.has("cursor") ? "page-two" : null,
      },
    });
  });
  await page.goto("/app?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Browse existing labels", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Use #catalog_first", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "More existing labels", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Use #remote_design", exact: true }),
  ).toBeVisible();
  expect(
    queries.some(
      (url) =>
        url.searchParams.get("q") === "" && url.searchParams.has("cursor"),
    ),
  ).toBe(true);
  const input = dialog.getByLabel("Project labels", { exact: true });
  await input.fill("remote");
  await expect(
    dialog.getByRole("button", { name: "Use #remote_design", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Use #remote_design", exact: true })
    .click();
  await expect(dialog.locator(".connection-label-chips > span")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", {
      name: "Remove label remote_design",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Remove label remote", exact: true }),
  ).toHaveCount(0);
  await expect(input).toHaveValue("");
  expect(
    queries.every((url) => url.searchParams.get("mode") === "catalog"),
  ).toBe(true);
  expect(queries.some((url) => url.searchParams.get("q") === "remote")).toBe(
    true,
  );
});

test("picker exposes loading and retry, and an older request never replaces a newer search", async ({
  page,
  context,
}) => {
  await signIn(context);
  let failed = false;
  let finishOld!: () => void;
  const oldDelivered = new Promise<void>((resolve) => {
    finishOld = resolve;
  });
  await page.route("**/api/connections?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    // Scope the outage/race to the label picker, not the overview's catalog.
    if (params.get("mode") !== "catalog" || params.get("limit") !== "20")
      return route.continue();
    const q = params.get("q");
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    if (q === "old") await new Promise((resolve) => setTimeout(resolve, 700));
    const label = q === "old" ? "old_result" : "new_result";
    await route.fulfill({
      json: {
        groups: [{ key: label, label, projectCount: 1, taskCount: 0 }],
        total: 1,
        nextCursor: null,
      },
    });
    if (q === "old") finishOld();
  });
  await page.goto("/app?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    input = dialog.getByLabel("Project labels", { exact: true });
  await input.focus();
  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: "Could not load existing labels" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Retry labels", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Use #new_result", exact: true }),
  ).toBeVisible();
  const oldRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("q") === "old",
  );
  await input.fill("old");
  await expect(
    dialog.getByRole("status").filter({ hasText: "Loading labels" }),
  ).toBeVisible();
  await oldRequest;
  await input.fill("new");
  await expect(
    dialog.getByRole("button", { name: "Use #new_result", exact: true }),
  ).toBeVisible();
  await oldDelivered;
  await expect(
    dialog.getByRole("button", { name: "Use #new_result", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Use #old_result", exact: true }),
  ).toHaveCount(0);
});

test("picker retains label count and Unicode length validation", async ({
  page,
}) => {
  await page.goto("/demo?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    input = dialog.getByLabel("Project labels", { exact: true });
  await input.fill("😀".repeat(31));
  await input.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("30 characters");
  await expect(dialog.locator(".connection-label-chips > span")).toHaveCount(0);
  await input.fill("😀".repeat(30));
  await input.press("Enter");
  await expect(dialog.locator(".connection-label-chips > span")).toHaveCount(1);
  for (let i = 1; i < 10; i++) {
    await input.fill(`label_${i}`);
    await input.press("Enter");
  }
  await expect(input).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Browse existing labels", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator(".connection-label-chips > span")).toHaveCount(
    10,
  );
});
