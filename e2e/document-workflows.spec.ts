import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectOption } from "./ui-helpers";
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
test("Board creation offers labelled documents and uploads after project creation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Document creation journey");
  await dialog.getByLabel("Choose project documents").setInputFiles({
    name: "Meeting.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Meeting notes"),
  });
  await selectOption(
    dialog.getByLabel("Purpose for Meeting.txt"),
    "Meeting Notes",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const names = dialog.locator(".creation-document-name");
    for (const name of await names.all())
      expect((await name.boundingBox())!.width).toBeGreaterThanOrEqual(120);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: "Meeting.txt", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Purpose for Meeting.txt")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all documents", exact: true }),
  ).toBeVisible();
});
test("shared Files table has clear metadata, purpose and cross-app archive controls", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/workspace/settings?tab=files");
  for (const name of [
    "Purpose",
    "Project / task",
    "App",
    "Uploader",
    "Uploaded",
  ])
    await expect(
      page.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download all documents", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Filter document purpose")).toBeVisible();
  await selectOption(page.getByLabel("Filter file app"), "board");
  const exportRequest = page.waitForRequest((r) =>
    r.url().endsWith("/api/attachments/archive"),
  );
  await page
    .getByRole("button", { name: "Download all documents", exact: true })
    .click();
  expect((await exportRequest).postDataJSON()).toEqual({ kind: "workspace" });
});

test("partial creation uploads retry against one project and keep completed files", async ({
  page,
  context,
}) => {
  await signIn(context);
  let creates = 0;
  let fail = true;
  page.on("request", (r) => {
    if (
      r.url().endsWith("/api/board-room") &&
      r.method() === "POST" &&
      r.postDataJSON()?.action === "saveProject"
    )
      creates++;
  });
  await page.route("**/api/attachments", async (route) => {
    const r = route.request();
    if (
      r.method() === "POST" &&
      r.postDataJSON()?.filename === "Retry.txt" &&
      fail
    )
      await route.fulfill({
        status: 503,
        json: { error: "Temporary upload problem" },
      });
    else await route.continue();
  });
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Retry project");
  await dialog.getByLabel("Choose project documents").setInputFiles([
    {
      name: "Ready.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("First document"),
    },
    {
      name: "Retry.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Second document"),
    },
  ]);
  for (const file of ["Ready.txt", "Retry.txt"])
    await selectOption(dialog.getByLabel(`Purpose for ${file}`), "KKP");
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    dialog.getByText(/some documents still need uploading/),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Project name", { exact: true }),
  ).toBeDisabled();
  expect(creates).toBe(1);
  fail = false;
  await dialog
    .getByRole("button", { name: "Resume uploads", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: "Ready.txt", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Retry.txt", exact: true }),
  ).toBeVisible();
  expect(creates).toBe(1);
  await expect(
    dialog.getByRole("link", { name: "Ready.txt", exact: true }),
  ).toHaveCount(1);
});

test("project ZIP contains exact private documents and purpose index; labels persist", async ({
  page,
  context,
}) => {
  await signIn(context);
  const response = await page.request.post("/api/board-room", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: { externalId: `ZIP-${Date.now()}`, name: "ZIP evidence project" },
    },
  });
  expect(response.ok()).toBeTruthy();
  const { project } = await response.json();
  const r = await page.request.post("/api/attachments", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      entityType: "boardRoomProject",
      entityId: project.id,
      filename: "Evidence.txt",
      contentType: "text/plain",
      size: 8,
      purpose: "Reference",
    },
  });
  const file = await r.json();
  expect(file.provider).toBe("local");
  expect(
    (
      await page.request.post(`/api/attachments/local-upload?id=${file.id}`, {
        headers: {
          origin: "http://127.0.0.1:3100",
          "content-type": "text/plain",
        },
        data: Buffer.from("Evidence"),
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post(`/api/attachments/${file.id}`, {
        headers: { origin: "http://127.0.0.1:3100" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto(`/board-room/projects/${project.id}?projectTab=documents`);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/board-room**", (route) =>
    route.request().method() === "GET" &&
    new URL(route.request().url()).pathname === "/api/board-room"
      ? route.fulfill({
          status: 503,
          json: { error: "Simulated refresh failure" },
        })
      : route.continue(),
  );
  const unavailableRefresh = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname === "/api/board-room" &&
      r.status() === 503,
  );
  await selectOption(page.getByLabel("Purpose for Evidence.txt"), "KKF");
  await unavailableRefresh;
  await expect(page.getByLabel("Purpose for Evidence.txt")).toHaveAttribute(
    "data-value",
    "KKF",
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(browserErrors).toEqual([]);
  await page.unroute("**/api/board-room**");
  await page.reload();
  await expect(page.getByLabel("Purpose for Evidence.txt")).toHaveAttribute(
    "data-value",
    "KKF",
  );
  await page
    .getByRole("button", { name: "Download all documents", exact: true })
    .click();
  const archive = page.getByRole("dialog", {
    name: "Download documents",
    exact: true,
  });
  await expect(archive.getByText(/1 documents/)).toBeVisible();
  const transfer = page.waitForEvent("download");
  await archive.getByRole("button", { name: /Download ZIP/ }).click();
  const saved = await transfer;
  const { unzipSync, strFromU8 } = await import("fflate");
  const content = unzipSync(await readFile((await saved.path())!));
  const path = Object.keys(content).find((p) => p.endsWith("Evidence.txt"))!;
  expect(strFromU8(content[path])).toBe("Evidence");
  expect(strFromU8(content["document-index.csv"])).toContain("KKF");
});

test("archive and label routes enforce sign-in and origin boundaries", async ({
  page,
  context,
  browser,
}) => {
  const anon = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  expect(
    (
      await anon.request.post("/api/attachments/archive", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { kind: "workspace" },
      })
    ).status(),
  ).toBe(401);
  await anon.close();
  await signIn(context);
  expect(
    (
      await page.request.post("/api/attachments/archive", {
        headers: { origin: "https://invalid.example" },
        data: { kind: "workspace" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch(`/api/attachments/${crypto.randomUUID()}`, {
        headers: { origin: "https://invalid.example" },
        data: { purpose: "KKP", expectedPurpose: null },
      })
    ).status(),
  ).toBe(403);
});

test("cancelled archive sessions do not leak progress into a reopened download", async ({
  page,
  context,
}) => {
  await signIn(context);
  const id = crypto.randomUUID();
  const file = {
    id,
    filename: "Held.txt",
    size: 4,
    purpose: "Reference",
    ownerEmail: "test@example.com",
    createdAt: new Date().toISOString(),
    room: "board",
    projectId: crypto.randomUUID(),
    projectName: "Held project",
    taskName: null,
    path: "Board Room/Held/Held.txt",
  };
  await page.route("**/api/attachments/archive", (r) =>
    r.fulfill({ json: { files: [file], bytes: 4, excluded: 0 } }),
  );
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(
    `**/api/attachments/${id}/content?download=1`,
    async (route) => {
      await gate;
      await route.fulfill({ status: 200, body: "Held" }).catch(() => {});
    },
  );
  await page.goto("/workspace/settings?tab=files");
  await page
    .getByRole("button", { name: "Download all documents", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Download documents",
    exact: true,
  });
  await dialog.getByRole("button", { name: /Download ZIP/ }).click();
  await expect(
    dialog.getByRole("button", { name: "Cancel download", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Download all documents", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Download documents",
    exact: true,
  });
  await expect(dialog.getByText(/1 documents/)).toBeVisible();
  release();
  await expect(
    dialog.getByRole("group", {
      name: "Download: Documents part 1.zip",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("Files typography and labelled controls remain consistent across apps, themes and widths", async ({
  page,
  context,
}, info) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await signIn(context);
  test.setTimeout(60000);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const board = await (
    await page.request.post("/api/board-room", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        action: "saveProject",
        values: {
          externalId: `TYPE-${Date.now()}`,
          name: "Typography project",
        },
      },
    })
  ).json();
  for (const [entityType, entityId] of [
    ["project", workspace.projects[0].id],
    ["boardRoomProject", board.project.id],
  ]) {
    const response = await page.request.post("/api/attachments", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        entityType,
        entityId,
        filename: "Typography.txt",
        contentType: "text/plain",
        size: 8,
        purpose: "Reference",
      },
    });
    expect(response.ok()).toBeTruthy();
    const file = await response.json();
    expect(file.provider).toBe("local");
    expect(
      (
        await page.request.post(`/api/attachments/local-upload?id=${file.id}`, {
          headers: {
            origin: "http://127.0.0.1:3100",
            "content-type": "text/plain",
          },
          data: Buffer.from("Evidence"),
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await page.request.post(`/api/attachments/${file.id}`, {
          headers: { origin: "http://127.0.0.1:3100" },
        })
      ).ok(),
    ).toBeTruthy();
  }

  for (const [name, path] of [
    ["shared", "/workspace/settings?tab=files"],
    ["locker", "/app?section=files"],
    ["board", "/board-room?section=files"],
  ]) {
    await page.goto(path);
    await expect(page.locator(".file-table")).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBe(width);
        for (const control of await page
          .locator('.file-manager-toolbar [role="combobox"]')
          .all()) {
          expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(
            180,
          );
        }
        const values = await page
          .locator(".file-table tbody tr")
          .first()
          .evaluate((row) => {
            const name = row.querySelector(".managed-file-name strong"),
              size = row.children[5],
              uploader = row.querySelector(".file-uploader");
            return {
              name: name ? getComputedStyle(name).fontSize : null,
              size: size ? getComputedStyle(size).fontSize : null,
              uploader: uploader ? getComputedStyle(uploader).fontSize : null,
            };
          });
        if (values.name) {
          expect(values.name).toBe(values.size);
          expect(values.name).toBe(values.uploader);
        }
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: info.outputPath(`${name}-${theme}-${width}.png`),
            fullPage: true,
          });
      }
      expect(
        (await new AxeBuilder({ page }).include(".file-manager").analyze())
          .violations,
      ).toEqual([]);
    }
  }
});

test("long document names remain readable in desktop project popups", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const filename =
    "KKP Backbone 500 kV Kalimantan - Signed project document with a long filename.pdf";
  await dialog.getByLabel("Choose project documents").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n"),
  });
  for (const width of [720, 900, 1117, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const name = dialog.locator(".creation-document-name");
    expect((await name.boundingBox())!.width).toBeGreaterThanOrEqual(180);
    expect((await name.boundingBox())!.height).toBeLessThan(140);
  }
});
