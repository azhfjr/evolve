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
test("personal Board views persist across sessions without leaking to another account", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  const before = await page.request.get("/api/board-room/views");
  expect(before.status()).toBe(200);
  await page.goto("/board-room?category=Pembangkit&year=2028&stage=3");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Your Board saved views",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "View name", exact: true })
    .fill("Generation 2028");
  await dialog
    .getByRole("button", { name: "Save current view", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Apply Generation 2028", exact: true }),
  ).toBeVisible();
  const other = await browser.newContext();
  await signIn(other, "e2e-member");
  const otherViews = await (
    await other.request.get(origin + "/api/board-room/views")
  ).json();
  expect(
    otherViews.views.some(
      (v: { name: string }) => v.name === "Generation 2028",
    ),
  ).toBe(false);
  await other.close();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.goto("/board-room?category=Transmisi");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Apply Generation 2028", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/category=Pembangkit/);
  await expect(page).toHaveURL(/year=2028/);
  await expect(page).toHaveURL(/stage=3/);
  await page.reload();
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Apply Generation 2028", exact: true }),
  ).toBeVisible();
});
test("Board saved-view API enforces ownership, versions, limits and admission", async ({
  page,
  context,
  browser,
}) => {
  expect((await page.request.get("/api/board-room/views")).status()).toBe(401);
  await signIn(context);
  const create = await page.request.post("/api/board-room/views", {
    headers: { origin },
    data: {
      name: "Ownership",
      filters: {
        query: { category: "Gardu Induk", page: 8 },
        section: "projects",
        view: "table",
      },
    },
  });
  expect(create.status()).toBe(200);
  const { view } = await create.json();
  expect(view.filters.query.page).toBeUndefined();
  const other = await browser.newContext();
  await signIn(other, "e2e-member");
  expect(
    (
      await other.request.patch(origin + "/api/board-room/views", {
        headers: { origin },
        data: { id: view.id, version: view.version, name: "Stolen" },
      })
    ).status(),
  ).toBe(404);
  await other.close();
  expect(
    (
      await page.request.patch("/api/board-room/views", {
        headers: { origin: "https://wrong.example" },
        data: { id: view.id, version: view.version, name: "Wrong" },
      })
    ).status(),
  ).toBe(403);
  const renamed = await page.request.patch("/api/board-room/views", {
    headers: { origin },
    data: { id: view.id, version: view.version, name: "Renamed ownership" },
  });
  expect(renamed.status()).toBe(200);
  expect(
    (
      await page.request.delete("/api/board-room/views", {
        headers: { origin },
        data: { id: view.id, version: view.version },
      })
    ).status(),
  ).toBe(409);
  const current = (await renamed.json()).view;
  expect(
    (
      await page.request.delete("/api/board-room/views", {
        headers: { origin },
        data: { id: view.id, version: current.version },
      })
    ).status(),
  ).toBe(200);
  await page.request.post("/api/board-room/views", {
    headers: { origin },
    data: { name: "Duplicate name", filters: {} },
  });
  const duplicate = await page.request.post("/api/board-room/views", {
    headers: { origin },
    data: { name: "duplicate name", filters: {} },
  });
  expect(duplicate.status()).toBe(409);
});

test("rename conflicts preserve input and can be refreshed, retried, updated and deleted", async ({
  page,
  context,
}) => {
  await signIn(context, "e2e-member");
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Your Board saved views",
    exact: true,
  });
  const name = dialog.getByRole("textbox", { name: "View name", exact: true });
  await name.fill("Conflict view");
  await dialog
    .getByRole("button", { name: "Save current view", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Rename Conflict view", exact: true })
    .click();
  await expect(name).toBeFocused();
  await name.fill("My preserved rename");
  const views = await (await page.request.get("/api/board-room/views")).json();
  const view = views.views.find(
    (v: { name: string }) => v.name === "Conflict view",
  );
  expect(
    (
      await page.request.patch("/api/board-room/views", {
        headers: { origin },
        data: { id: view.id, version: view.version, name: "Other tab name" },
      })
    ).ok(),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Rename view", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("changed");
  await expect(name).toHaveValue("My preserved rename");
  await dialog
    .getByRole("button", { name: "Refresh saved views", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Apply Other tab name", exact: true }),
  ).toBeVisible();
  await expect(name).toHaveValue("My preserved rename");
  await dialog
    .getByRole("button", { name: "Rename view", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Apply My preserved rename",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: "Update My preserved rename with current filters",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Delete My preserved rename",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Delete My preserved rename", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Apply My preserved rename",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("a successful write remains visible when only the list refresh fails", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Your Board saved views",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Refresh saved views", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/board-room/views", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "List refresh unavailable" }),
        })
      : route.continue(),
  );
  await dialog
    .getByRole("textbox", { name: "View name", exact: true })
    .fill("Saved during refresh failure");
  await dialog
    .getByRole("button", { name: "Save current view", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Apply Saved during refresh failure",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("saved");
  await expect(dialog.getByRole("alert")).toContainText("refresh");
  await page.unroute("**/api/board-room/views");
  await dialog
    .getByRole("button", { name: "Refresh saved views", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Apply Saved during refresh failure",
      exact: true,
    }),
  ).toHaveCount(1);
});
