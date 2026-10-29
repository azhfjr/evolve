import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { selectOption } from "../e2e/ui-helpers";
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
test("create project with COD dropdown and dated documents, edit metadata and open shared Storyline", async ({
  page,
}, info) => {
  const suffix = info.project.name || "chromium";
  const filename = `KKP Backbone 500 kV Kalimantan Signed reference ${suffix}.txt`;
  await page.goto("/board-room");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Storyline " + suffix);
  await expect(
    dialog.getByRole("combobox", { name: "Planned COD year", exact: true }),
  ).toHaveText("Select Planned COD Year");
  await selectOption(
    dialog.getByLabel("Planned COD year", { exact: true }),
    "2030",
  );
  await dialog.getByLabel("Choose project documents").setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("Verified document chronology"),
  });
  await selectOption(dialog.getByLabel("Purpose for " + filename), "Reference");
  await dialog
    .getByLabel("Document date for " + filename, { exact: true })
    .fill("2028-02-29");
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      (await dialog.locator(".creation-document-name").boundingBox())!.width,
    ).toBeGreaterThan(100);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/board-room") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "saveProject",
  );
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const created = (await (await saved).json()).project;
  await expect(
    dialog.getByRole("link", { name: filename, exact: true }),
  ).toBeVisible();
  await page.goto(`/board-room/projects/${created.id}?projectTab=storyline`);
  await expect(
    page.getByRole("heading", { name: "Project Storyline", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: filename, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("29 February 2028", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Edit document date for " + filename,
      exact: true,
    })
    .click();
  const dateDialog = page.getByRole("dialog", {
    name: "Edit document date",
    exact: true,
  });
  await dateDialog
    .getByLabel("Document date", { exact: true })
    .fill("2029-01-05");
  await dateDialog
    .getByRole("button", { name: "Save date", exact: true })
    .click();
  await expect(dateDialog).toHaveCount(0);
  await expect(page.getByText("5 January 2029", { exact: true })).toBeVisible();
  const files = (
    await (
      await page.request.get(
        `/api/attachments?entityType=boardRoomProject&entityId=${created.id}`,
      )
    ).json()
  ).attachments;
  expect(files[0].documentDate).toBe("2029-01-05");
  await page.goto(
    `/app?section=project&project=${created.id}&projectTab=storyline`,
  );
  await expect(
    page.getByRole("heading", { name: "Project Storyline", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: filename, exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download " + filename, exact: true })
    .click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe(
    info.project.name === "webkit" ? filename.replaceAll(" ", "_") : filename,
  );
  expect(await readFile((await downloaded.path())!, "utf8")).toBe(
    "Verified document chronology",
  );
});
test("Storyline visual, accessibility, date conflicts and live refresh preserve inputs", async ({
  page,
  context,
}, info) => {
  await page.goto(`/board-room/projects/${projectId}?projectTab=documents`);
  await selectOption(
    page.getByLabel("Upload document purpose"),
    "Meeting Notes",
  );
  await page.getByLabel("Upload document date").fill("2027-11-01");
  const name = `Chronology ${info.project.name || "chromium"}.txt`;
  await page
    .getByLabel("Upload project document", { exact: true })
    .setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from("meeting"),
    });
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Storyline", exact: true })
    .click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Edit document date for " + name,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit document date",
    exact: true,
  });
  await dialog.getByLabel("Document date", { exact: true }).fill("2028-01-02");
  const files = (
    await (
      await page.request.get(
        `/api/attachments?entityType=boardRoomProject&entityId=${projectId}`,
      )
    ).json()
  ).attachments;
  const file = files.find((f: { filename: string }) => f.filename === name);
  const updated = await page.request.patch(
    `/api/attachments/${file.id}/metadata`,
    {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        documentDate: null,
        expectedDocumentVersion: file.documentVersion,
      },
    },
  );
  expect(updated.ok()).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Undated documents (1)",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(1);
  await expect(dialog.getByLabel("Document date", { exact: true })).toHaveValue(
    "2028-01-02",
  );
  await dialog.getByRole("button", { name: "Save date", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed");
  await expect(dialog.getByLabel("Document date", { exact: true })).toHaveValue(
    "2028-01-02",
  );
  await dialog
    .getByRole("button", { name: "Refresh metadata and keep my input" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Latest saved date");
  await dialog.getByRole("button", { name: "Save date", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("2 January 2028", { exact: true })).toBeVisible();
  await mkdir("docs/audits/project-storyline/screenshots", { recursive: true });
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.setViewportSize({ width, height: 1000 });
      const projectTabs = page.getByRole("navigation", {
        name: "Project sections",
      });
      await expect
        .poll(async () => {
          const nav = await projectTabs.boundingBox(),
            active = await projectTabs
              .getByRole("button", { name: "Storyline", exact: true })
              .boundingBox();
          return (
            !!nav &&
            !!active &&
            active.x >= nav.x - 1 &&
            active.x + active.width <= nav.x + nav.width + 1
          );
        })
        .toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/audits/project-storyline/screenshots/${info.project.name || "chromium"}-${theme}-${width}.png`,
        fullPage: false,
      });
    }
  const axe = await new AxeBuilder({ page })
    .include(".project-storyline")
    .analyze();
  expect(axe.violations).toEqual([]);
  const viewer = await context.browser()!.newContext();
  await auth(viewer, "e2e-member");
  const readPage = await viewer.newPage();
  await readPage.goto(
    `http://127.0.0.1:3100/board-room/projects/${projectId}?projectTab=storyline`,
  );
  await expect(readPage.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    readPage.getByRole("button", { name: "Edit document date for " + name }),
  ).toHaveCount(0);
  const denied = await readPage.request.patch(
    `/api/attachments/${file.id}/metadata`,
    {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        documentDate: null,
        expectedDocumentVersion: file.documentVersion,
      },
    },
  );
  expect(denied.status()).toBe(403);
  await viewer.close();
});
test("asset forms expose persistent field guidance and save supported technical values", async ({
  page,
}, info) => {
  await page.goto("/board-room?section=assets");
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const name of [
    "RUPTL code",
    "Asset name",
    "Capacity",
    "Capacity unit",
    "Voltage",
  ])
    await expect(dialog.getByLabel(name, { exact: true })).toHaveAttribute(
      "aria-describedby",
      /.+/,
    );
  await dialog
    .getByLabel("RUPTL code", { exact: true })
    .fill("STORY-GUIDANCE-" + (info.project.name || "chromium"));
  await dialog
    .getByLabel("Asset name", { exact: true })
    .fill("Guided asset " + (info.project.name || "chromium"));
  await dialog.getByLabel("Capacity", { exact: true }).fill("150");
  await dialog.getByLabel("Capacity unit", { exact: true }).fill("MVA");
  await dialog.getByLabel("Voltage", { exact: true }).fill("150 kV");
  await dialog.getByRole("button", { name: "Save asset", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Guided asset " + (info.project.name || "chromium"), {
      exact: true,
    }),
  ).toBeVisible();
});

test("historical COD remains selectable and persists while all new choices are 2026–2040", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(".data/connected-fixture.json", "utf8"),
  );
  await page.goto("/board-room/projects/" + fixture.historicalProjectId);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const year = dialog.getByLabel("Planned COD year", { exact: true });
  await expect(year).toContainText("2024 (stored historical year)");
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Historical COD retained");
  await dialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit project", exact: true }),
  ).toBeVisible();
  const project = (
    await (
      await page.request.get(
        "/api/board-room?id=" + fixture.historicalProjectId,
      )
    ).json()
  ).project;
  expect(project.codYear).toBe(2024);
});
test("native 200 percent zoom preserves project Storyline in both apps", async ({}, info) => {
  test.skip(
    !!info.project.name,
    "Native zoom uses the installed Chromium extension API.",
  );
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)(
    process.execPath,
    ["--import", "tsx", "scripts/verify-native-zoom.ts"],
    {
      timeout: 75000,
      env: { ...process.env, EVOLVE_ZOOM_PROJECT_ID: projectId },
    },
  );
  const evidence = JSON.parse(
    await readFile("test-results/balanced-native-zoom.json", "utf8"),
  );
  await writeFile(
    "docs/audits/project-storyline/native-zoom.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
});

test("live refresh retains explored document pages and their focused entry", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/board-room/storyline?**", async (route) => {
    requests++;
    const second = new URL(route.request().url()).searchParams.has("cursor");
    const start = second ? 50 : 0;
    await route.fulfill({
      json: {
        items: Array.from({ length: 50 }, (_, i) => {
          const id = `00000000-0000-4000-8000-${String(start + i + 1).padStart(12, "0")}`;
          return {
            id,
            documentId: id,
            documentVersion: 1,
            versionNumber: 1,
            isCurrent: true,
            documentDate: "2028-01-01",
            filename: `Refresh evidence ${start + i + 1}.txt`,
            purpose: "Reference",
            contentType: "text/plain",
            size: 3,
            ownerEmail: "fixture@example.test",
            createdAt: "2028-01-02T00:00:00Z",
          };
        }),
        datedCount: 100,
        undatedCount: 0,
        nextCursor: second ? null : "page2",
        revision: 1,
      },
    });
  });
  await page.goto(`/board-room/projects/${projectId}?projectTab=storyline`);
  await page
    .getByRole("button", { name: "Load more documents", exact: true })
    .click();
  const anchor = page.getByRole("link", {
    name: "Refresh evidence 80.txt",
    exact: true,
  });
  await anchor.focus();
  await expect(page.locator(".storyline-document")).toHaveCount(100);
  const before = requests;
  await page.evaluate(() => window.dispatchEvent(new Event("evolve:changed")));
  await expect.poll(() => requests).toBeGreaterThanOrEqual(before + 2);
  await expect(
    page.getByRole("region", { name: "Project Storyline", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".storyline-document")).toHaveCount(100);
  await expect(anchor).toBeFocused();
});

test("Locker canonical project downloads shared documents and task files in one private ZIP", async ({
  page,
}, info) => {
  const suffix = info.project.name || "chromium",
    projectName = `Archive project ${suffix}.txt`,
    taskName = `Archive task ${suffix}.txt`,
    taskTitle = `Archive follow-up ${suffix}`;
  await page.goto(`/board-room/projects/${projectId}?projectTab=documents`);
  await selectOption(page.getByLabel("Upload document purpose"), "Reference");
  await page
    .getByLabel("Upload project document", { exact: true })
    .setInputFiles({
      name: projectName,
      mimeType: "text/plain",
      buffer: Buffer.from("project evidence"),
    });
  await expect(
    page.getByRole("link", { name: projectName, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add project task", exact: true })
    .click();
  await page.getByLabel("Task title", { exact: true }).fill(taskTitle);
  await page.getByLabel("Task title", { exact: true }).press("Control+Enter");
  await expect(page.getByLabel("Task title", { exact: true })).toHaveCount(0);
  const hub = await (
    await page.request.get("/api/board-room/hub?id=" + projectId)
  ).json();
  const task = hub.tasks.find((t: { title: string }) => t.title === taskTitle);
  expect(task).toBeTruthy();
  const headers = { Origin: "http://127.0.0.1:3100" };
  const reserved = await page.request.post("/api/attachments", {
    headers,
    data: {
      entityType: "task",
      entityId: task.id,
      filename: taskName,
      contentType: "text/plain",
      size: 4,
      purpose: "Reference",
    },
  });
  expect(reserved.ok()).toBe(true);
  const reservation = await reserved.json();
  expect(
    (
      await page.request.post(
        "/api/attachments/local-upload?id=" + reservation.id,
        { headers: { ...headers, "Content-Type": "text/plain" }, data: "task" },
      )
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/attachments/" + reservation.id, { headers })
    ).ok(),
  ).toBe(true);
  await page.goto(`/app?section=project&project=${projectId}`);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/attachments/archive") &&
      r.request().method() === "POST",
  );
  await page
    .locator("#project-documents")
    .getByRole("button", { name: "Download all documents", exact: true })
    .click();
  const manifest = await (await response).json();
  expect(
    manifest.files.some(
      (f: { filename: string }) => f.filename === projectName,
    ),
  ).toBe(true);
  expect(
    manifest.files.some((f: { filename: string }) => f.filename === taskName),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog", { name: "Download documents", exact: true })
    .getByRole("button", { name: /^Download ZIP/ })
    .click();
  const file = await download;
  const { unzipSync } = await import("fflate");
  const files = unzipSync(await readFile((await file.path())!));
  for (const [name, text] of [
    [projectName, "project evidence"],
    [taskName, "task"],
  ]) {
    const key = Object.keys(files).find((path) => path.endsWith(name));
    expect(key).toBeTruthy();
    expect(Buffer.from(files[key!]).toString()).toBe(text);
  }
});
