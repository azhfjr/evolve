import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { selectOption } from "../e2e/ui-helpers";
import AxeBuilder from "@axe-core/playwright";
let projectId: string;
async function auth(context: BrowserContext, role = "e2e-admin") {
  const tokens = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: tokens[role],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.beforeAll(async () => {
  projectId = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  ).projectId;
});
test.beforeEach(async ({ context }) => auth(context));
test("dedicated Storyline selector, deep link and isolated empty chronology", async ({
  page,
}) => {
  await page.goto("/board-room?section=storyline");
  await expect(
    page.getByRole("heading", { name: "Storyline", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Storyline project Choose project/ })
    .click();
  await page
    .getByRole("textbox", { name: "Search storyline project" })
    .fill("Connected QA");
  await page.getByRole("button", { name: /Connected QA project/ }).click();
  await expect(page).toHaveURL(new RegExp("storyProject=" + projectId));
  await expect(
    page.getByRole("heading", { name: "Project Storyline", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Project Storyline", exact: true }),
  ).toBeVisible();
  await page.goto("/board-room");
  await expect(
    page.getByRole("heading", { name: "Project Storyline", exact: true }),
  ).toHaveCount(0);
});
test("Board costs save, cancel and reload with Locker read-only downstream", async ({
  page,
}) => {
  await page.goto(`/board-room?section=costs&costProject=${projectId}`);
  await page
    .getByRole("button", { name: "Edit project costs", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: /Project costs/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit project costs", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Add option", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Option name", exact: true })
    .fill("QA option");
  await dialog
    .getByRole("textbox", { name: "Cost title", exact: true })
    .fill("Equipment");
  await selectOption(
    dialog.getByRole("combobox", { name: "Unit", exact: true }),
    "USD",
  );
  await dialog
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("125.50");
  await dialog
    .getByRole("button", { name: "Save project costs", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("QA option", { exact: true })).toBeVisible();
  await page.goto(`/app?section=project&project=${projectId}`);
  await expect(
    page.getByRole("button", {
      name: /Manage project costs|Edit project costs/,
    }),
  ).toHaveCount(0);
});
test("template draft publish required creation sync and retained values", async ({
  page,
}) => {
  await page.goto("/board-room?section=project-template");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByLabel("Stable field key", { exact: true })
    .fill("funding_source");
  await page.getByLabel("Field label", { exact: true }).fill("Funding source");
  await page
    .getByLabel("Guidance", { exact: true })
    .fill("Choose the recorded funding source.");
  await page.getByLabel("Option 1", { exact: true }).fill("Internal");
  await page.getByLabel("Required", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save template draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish template", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Publish template", exact: true })
    .click();
  await expect(page.getByText(/Published revision 1\./)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Sync Template to Existing Projects",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review synchronization", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm synchronization", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review synchronization", exact: true }),
  ).toHaveCount(0);
  await page.goto("/board-room?section=projects");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Funding source", exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Template QA new project");
  await selectOption(
    dialog.getByRole("combobox", { name: "Funding source", exact: true }),
    { label: "Internal" },
  );
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByText("Template QA new project", { exact: true }).first(),
  ).toBeVisible();
  const view = await (
    await page.request.get("/api/board-room/project-template?manage=1")
  ).json();
  expect(view.definition.fields[0].key).toBe("funding_source");
  const old = await (
    await page.request.get("/api/board-room/project-template?id=" + projectId)
  ).json();
  expect(old.revision).toBe(1);
  expect(old.values).toEqual({});
});
test("Map uses shared category counts, synchronized filters and accessible responsive controls", async ({
  page,
}) => {
  await page.goto("/board-room?section=map");
  await expect(
    page.getByRole("heading", { name: "Geographic Map", exact: true }),
  ).toBeVisible();
  const map = page.getByRole("region", {
    name: "Kalimantan regional distribution",
  });
  await expect(map).toBeVisible();
  for (const label of [
    "Pembangkit",
    "Transmisi",
    "Gardu Induk",
    "Uncategorized",
  ])
    await expect(
      map.getByRole("button", { name: new RegExp(label) }).first(),
    ).toBeVisible();
  await map.getByRole("button", { name: /Pembangkit/ }).click();
  await expect(page).toHaveURL(/category=Pembangkit/);
  await map.getByRole("button", { name: "Zoom map in", exact: true }).click();
  await expect(
    map.getByRole("button", { name: "Pan map left", exact: true }),
  ).toBeVisible();
  await map.getByRole("button", { name: "Fit map", exact: true }).click();
  await mkdir("docs/audits/feature-expansion/screenshots", { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `docs/audits/feature-expansion/screenshots/map-${width}.png`,
      fullPage: true,
    });
  }
  const a = await new AxeBuilder({ page }).include(".regional-panel").analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});
test("member and outsider write boundaries reject template and cost mutation", async ({
  page,
  context,
}) => {
  await auth(context, "e2e-member");
  await page.goto("/board-room?section=storyline");
  expect(
    (
      await page.request.post("/api/board-room/project-template", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { action: "publish", version: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/board-room/costs?id=" + projectId, {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { version: 1, options: [] },
      })
    ).status(),
  ).toBe(403);
  await auth(context, "e2e-outsider");
  expect([401, 403]).toContain(
    (
      await page.request.get("/api/board-room/project-template?id=" + projectId)
    ).status(),
  );
  expect([401, 403]).toContain(
    (await page.request.get("/api/board-room/costs?id=" + projectId)).status(),
  );
});
test("open project drafts retain their original template revision and custom values after publication", async ({
  page,
}) => {
  const current = await (
    await page.request.get("/api/board-room/project-template?manage=1")
  ).json();
  await page.goto("/board-room?section=projects");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Pinned template draft");
  if (current.definition.fields.length)
    await selectOption(
      dialog.getByRole("combobox", {
        name: current.definition.fields[0].label,
        exact: true,
      }),
      {
        label: current.definition.fields[0].options.find(
          (o: { active: boolean }) => o.active,
        ).label,
      },
    );
  await expect(
    dialog.getByRole("button", { name: "Create project", exact: true }),
  ).toBeEnabled();
  expect(
    (
      await page.request.post("/api/board-room/project-template", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { action: "publish", version: current.version },
      })
    ).ok(),
  ).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("evolve:changed")));
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find(
          (k) =>
            k.startsWith("evolve-form-draft-v1:") && k.endsWith(":project:new"),
        );
        return key ? JSON.parse(localStorage.getItem(key)!).values : null;
      }),
    )
    .toMatchObject({
      templateRevision: current.revision,
      ...(current.definition.fields.length
        ? {
            customValues: {
              [current.definition.fields[0].key]:
                current.definition.fields[0].options.find(
                  (o: { active: boolean }) => o.active,
                ).id,
            },
          }
        : {}),
    });
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/board-room") &&
      r.request().postDataJSON()?.action === "saveProject",
  );
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  expect((await response).status()).toBe(409);
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Pinned template draft",
  );
});
