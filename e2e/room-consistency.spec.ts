import { test, expect } from "@playwright/test";
import { selectOption } from "./ui-helpers";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ context }) => {
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
});
test("both rooms expose consistent branding and working sidebar utilities", async ({
  page,
}) => {
  for (const [route, name] of [
    ["/app", "Locker Room"],
    ["/board-room", "Board Room"],
  ]) {
    await page.goto(route);
    const sidebar = page
      .locator(route === "/app" ? ".sidebar" : ".br-sidebar")
      .first();
    await expect(
      sidebar.getByRole("link", { name: `${name} overview`, exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: `${name} overview`, exact: true }),
    ).toContainText(name);
    for (const label of [
      "Quick find",
      "Theme",
      "Settings",
      "Keyboard shortcuts",
    ])
      await expect(
        sidebar.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    await sidebar.getByRole("button", { name: "Theme", exact: true }).click();
    for (const label of ["Light", "Dark", "System"])
      await expect(
        page.getByRole("menuitemradio", { name: label, exact: true }),
      ).toBeVisible();
    await page.keyboard.press("Escape");
    await sidebar
      .getByRole("button", { name: "Keyboard shortcuts", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "A little more in flow" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      sidebar.getByRole("button", { name: /Workspace admin/ }),
    ).toBeVisible();
    if (route === "/board-room") {
      await sidebar.getByRole("button", { name: "Theme", exact: true }).click();
      await page
        .getByRole("menuitemradio", { name: "Dark", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(
        sidebar.getByRole("button", { name: "Theme", exact: true }),
      ).toBeEnabled();
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await sidebar.getByRole("button", { name: "Theme", exact: true }).click();
      await page
        .getByRole("menuitemradio", { name: "System", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme-preference",
        "system",
      );
      await expect(
        sidebar.getByRole("button", { name: "Theme", exact: true }),
      ).toBeEnabled();
      await page.getByLabel("Primary category filter", { exact: true }).click();
      await page.keyboard.press("n");
      await expect(page.getByRole("listbox")).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.keyboard.press("n");
      await expect(
        page.getByRole("dialog", { name: "Add project", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});
test("Board project editor uses asset selection and the five Kalimantan provinces", async ({
  page,
}) => {
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add project", exact: true });
  await expect(
    dialog.getByRole("button", { name: /selected assets/ }),
  ).toBeVisible();
  await expect(dialog.getByLabel("RUPTL Code", { exact: true })).toHaveCount(0);
  const location = dialog.getByRole("combobox", {
    name: "Location",
    exact: true,
  });
  await location.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
    "Not set",
    "Kalimantan Barat",
    "Kalimantan Tengah",
    "Kalimantan Selatan",
    "Kalimantan Timur",
    "Kalimantan Utara",
  ]);
  await page.keyboard.press("Escape");
  await selectOption(location, "Kalimantan Utara");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Province selection project");
  await dialog
    .getByRole("button", { name: /^(Save|Create) project$/, exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Province selection project" }),
  ).toContainText("Kalimantan Utara");
  const template = await page.request.get(
    "/board-room/project-upload-template.csv",
  );
  expect((await template.text()).split("\n")[0]).toContain("Project ID");
});
test("Board initial render avoids a duplicate dashboard request and room switching keeps the document", async ({
  page,
}) => {
  let snapshots = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/board-room" && r.method() === "GET")
      snapshots++;
  });
  await page.goto("/board-room");
  await expect(
    page.getByRole("heading", {
      name: "Kalimantan - Power System Projects",
      exact: true,
    }),
  ).toBeVisible();
  // Wait through the old debounced effect to observe redundant initial requests.
  await page.waitForTimeout(400);
  expect(snapshots).toBe(0);
  await page.evaluate(() => {
    (window as unknown as { roomDocument: string }).roomDocument = "retained";
  });
  await page
    .getByRole("button", { name: "Switch apps, currently Board Room" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /Locker Room/ })
    .click();
  await expect(page.locator(".sidebar")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { roomDocument: string }).roomDocument,
    ),
  ).toBe("retained");
  const created = await page.request.post("/api/board-room", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: {
        externalId: "SWITCH-FRESH",
        name: "Switch fresh snapshot project",
      },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  await page
    .getByRole("button", { name: "Switch apps, currently Locker Room" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /Board Room/ })
    .click();
  await expect(
    page.getByText("Switch fresh snapshot project", { exact: true }),
  ).toBeVisible();
  expect(snapshots).toBe(0);
});
test("Board uses shared upload phases, cancellation, download and document deletion confirmation", async ({
  page,
}) => {
  const create = await page.request.post("/api/board-room", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: {
        externalId: "TRANSFER-CONSISTENCY",
        name: "Transfer consistency project",
      },
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const { project } = await create.json();
  await page.goto(`/board-room/projects/${project.id}?projectTab=documents`);
  const dialog = page.getByRole("dialog", {
    name: "Transfer consistency project",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  let prepareRelease!: () => void,
    uploadRelease!: () => void,
    verifyRelease!: () => void;
  const prepareGate = new Promise<void>((r) => (prepareRelease = r)),
    uploadGate = new Promise<void>((r) => (uploadRelease = r)),
    verifyGate = new Promise<void>((r) => (verifyRelease = r));
  await page.route("**/api/attachments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await prepareGate;
    await route.continue();
  });
  await page.route("**/api/attachments/local-upload?*", async (route) => {
    await uploadGate;
    await route.continue();
  });
  await page.route(/\/api\/attachments\/[0-9a-f-]+$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await verifyGate;
    await route.continue();
  });
  await selectOption(dialog.getByLabel("Upload document purpose"), "Reference");
  await dialog.getByLabel("Upload project document").setInputFiles({
    name: "stage-evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Shared transfer evidence"),
  });
  const transfer = dialog.getByRole("group", {
    name: "Upload: stage-evidence.txt",
    exact: true,
  });
  await expect(transfer).toHaveAttribute("data-phase", "preparing");
  prepareRelease();
  await expect(transfer).toHaveAttribute("data-phase", "uploading");
  uploadRelease();
  await expect(transfer).toHaveAttribute("data-phase", "verifying");
  verifyRelease();
  await expect(transfer).toHaveAttribute("data-phase", "complete");
  await expect(
    dialog.getByRole("link", { name: "stage-evidence.txt", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Download stage-evidence.txt", exact: true })
    .click();
  await expect(
    dialog.getByRole("group", {
      name: "Download: stage-evidence.txt",
      exact: true,
    }),
  ).toHaveAttribute("data-phase", "complete");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  const confirmation = dialog.getByRole("group", {
    name: "Confirm attachment deletion",
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: "stage-evidence.txt", exact: true }),
  ).toBeVisible();
  let cancelledRelease!: () => void;
  const cancelledGate = new Promise<void>((r) => (cancelledRelease = r));
  await page.unroute("**/api/attachments/local-upload?*");
  await page.route("**/api/attachments/local-upload?*", async (route) => {
    await cancelledGate;
    await route.abort().catch(() => {});
  });
  await selectOption(dialog.getByLabel("Upload document purpose"), "Reference");
  await dialog.getByLabel("Upload project document").setInputFiles({
    name: "cancelled.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Cancel this transfer"),
  });
  const cancelled = dialog.getByRole("group", {
    name: "Upload: cancelled.txt",
    exact: true,
  });
  await expect(cancelled).toHaveAttribute("data-phase", "uploading");
  await cancelled
    .getByRole("button", { name: "Cancel upload", exact: true })
    .click();
  cancelledRelease();
  await expect(cancelled).toHaveAttribute("data-phase", "cancelled");
  await expect(
    dialog.getByRole("link", { name: "cancelled.txt", exact: true }),
  ).toHaveCount(0);
  const files = await (
    await page.request.get(
      `/api/attachments?entityType=boardRoomProject&entityId=${project.id}`,
    )
  ).json();
  expect(
    files.attachments.map((f: { filename: string }) => f.filename),
  ).toEqual(["stage-evidence.txt"]);
});
test("Board common management and search features work without leaving the room", async ({
  page,
}) => {
  await page.goto("/board-room");
  await page
    .locator(".br-sidebar")
    .getByRole("button", { name: "People", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Workspace people", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Invite teammate", exact: true }),
  ).toBeVisible();
  await page
    .locator(".br-sidebar")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await expect(page.locator(".activity-management")).toBeVisible();
  await page
    .locator(".br-sidebar")
    .getByRole("button", { name: "Quick find", exact: true })
    .click();
  await expect(page.locator(".br-search input")).toBeFocused();
  await page.locator(".br-search input").fill("missing project name");
  await expect(page.locator(".br-result-count")).toContainText("0 of");
});
test("search A to B to A retries an aborted request and navigation Back restores the section", async ({
  page,
}) => {
  const response = await page.request.post("/api/board-room", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: { externalId: "QUERY-RACE", name: "Race query keeper" },
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/board-room");
  await page
    .locator(".br-sidebar")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    first = new Promise<void>((r) => (started = r));
  let attempts = 0;
  await page.route("**/api/board-room?*", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("search") ===
      "Race query keeper"
    ) {
      attempts++;
      if (attempts === 1) {
        started();
        await gate;
        await route.abort().catch(() => {});
        return;
      }
    }
    await route.continue();
  });
  try {
    const search = page.locator(".br-search input");
    await search.fill("Race query keeper");
    await first;
    await search.fill("Race query temporary");
    await search.fill("Race query keeper");
    // Match the count boundary: an initial 11-of-N snapshot is not the
    // expected one-result response from the retried search.
    await expect(page.locator(".br-result-count")).toHaveText(
      /^1 of \d[\d,]* projects$/,
    );
    expect(attempts).toBe(2);
  } finally {
    release();
  }
  await page
    .locator(".br-sidebar")
    .getByRole("button", { name: "People", exact: true })
    .click();
  await expect(
    page
      .locator(".br-sidebar")
      .getByRole("button", { name: "People", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".br-topbar")).toContainText("People");
  await page.goBack();
  await expect(page.locator(".br-topbar")).toContainText("Projects");
});
