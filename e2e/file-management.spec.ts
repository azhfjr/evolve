import { selectOption } from "./ui-helpers";
import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
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
async function upload(
  request: APIRequestContext,
  filename: string,
  text: string,
) {
  const draftId = crypto.randomUUID();
  const reserve = await request.post("/api/attachments", {
    headers: { origin },
    data: {
      entityType: "taskDraft",
      entityId: draftId,
      filename,
      contentType: "text/plain",
      size: Buffer.byteLength(text),
    },
  });
  expect(reserve.ok()).toBeTruthy();
  const { id } = await reserve.json();
  expect(
    (
      await request.post(`/api/attachments/local-upload?id=${id}`, {
        headers: { origin, "content-type": "text/plain" },
        data: Buffer.from(text),
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`/api/attachments/${id}`, { headers: { origin } })
    ).ok(),
  ).toBeTruthy();
  return id as string;
}
test("admin manages another member's draft metadata and bulk deletion while content stays private", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  const member = await browser.newContext({ baseURL: origin });
  await signIn(member, "e2e-member");
  const first = await upload(
    member.request,
    "Managed private alpha.txt",
    "Private alpha content",
  );
  const second = await upload(
    member.request,
    "Managed private beta.txt",
    "Private beta content",
  );
  expect((await member.request.get("/api/attachments/manage")).status()).toBe(
    403,
  );
  const memberPage = await member.newPage();
  await memberPage.goto("/app?section=settings&tab=files");
  await expect(
    memberPage.getByRole("tab", { name: "Files", exact: true }),
  ).toHaveCount(0);
  await expect(
    memberPage.getByRole("tab", { name: "My account", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    (await page.request.get(`/api/attachments/${first}/content`)).status(),
  ).toBe(404);
  expect(
    (
      await member.request.delete("/api/attachments/manage", {
        headers: { origin },
        data: { ids: [first] },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.delete("/api/attachments/manage", {
        headers: { origin: "https://untrusted.example" },
        data: { ids: [first] },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/app?section=settings&tab=files");
  await page
    .getByRole("textbox", { name: "Search workspace files" })
    .fill("Managed private");
  await expect(page.locator(".file-table tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", {
      name: "Download Managed private alpha.txt",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Select all files on this page" })
    .check();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Delete 2 files?");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await member.request.get(`/api/attachments/${first}/content`)).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete 2 files", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".file-state").first()).toHaveText("Removing");
  expect(
    (await member.request.get(`/api/attachments/${first}/content`)).status(),
  ).toBe(404);
  expect(
    (await member.request.get(`/api/attachments/${second}/content`)).status(),
  ).toBe(404);
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search workspace files" })
    .fill("Managed private");
  await expect(page.locator(".file-state")).toHaveCount(2);
  await member.close();
});
test("file download shows real progress, supports cancellation and retries an interrupted response", async ({
  page,
  context,
}) => {
  await signIn(context);
  const text = "Download this original document\n";
  const id = await upload(page.request, "Managed download.txt", text);
  await page.goto("/app?section=settings&tab=files");
  const button = page.getByRole("button", {
    name: "Download Managed download.txt",
    exact: true,
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(
    `**/api/attachments/${id}/content?download=1`,
    async (route) => {
      await gate;
      await route.abort();
    },
  );
  await button.click();
  await expect(
    page.getByRole("group", {
      name: "Download: Managed download.txt",
      exact: true,
    }),
  ).toContainText("Downloading");
  await page
    .getByRole("button", { name: "Cancel download", exact: true })
    .click();
  await expect(page.locator(".file-transfer")).toContainText(
    "Transfer cancelled",
  );
  release();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(button).toBeEnabled();
  let interrupted = false;
  await page.route(
    `**/api/attachments/${id}/content?download=1`,
    (route) => {
      interrupted = true;
      return route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "truncated",
      });
    },
    { times: 1 },
  );
  await button.click();
  await expect.poll(() => interrupted).toBe(true);
  await expect(page.locator(".file-transfer").getByRole("alert")).toContainText(
    "interrupted",
  );
  const promise = page.waitForEvent("download");
  await button.click();
  const download = await promise;
  expect(download.suggestedFilename()).toBe("Managed download.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe(text);
  await expect(page.locator(".file-transfer")).toContainText(
    "Sent to your browser",
  );
});
for (const width of [1440, 390, 320])
  test(`Files settings reflows and supports keyboard access at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo?section=settings&tab=files");
    await expect(
      page.getByRole("heading", { name: "Files and storage", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("region", { name: "Workspace files", exact: true })
      .focus();
    await expect(
      page.getByRole("region", { name: "Workspace files", exact: true }),
    ).toBeFocused();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/files-${width}.png`,
      fullPage: true,
    });
  });

test("upload cancellation and finalization retry preserve the draft and avoid uploading twice", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app?section=all");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const editor = page.getByRole("region", { name: "Task editor", exact: true });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let firstUpload = true;
  await page.route("**/api/attachments/local-upload?**", async (route) => {
    if (firstUpload) {
      firstUpload = false;
      await gate;
      await route.abort();
    } else await route.continue();
  });
  let writes = 0,
    finalizations = 0;
  page.on("request", (r) => {
    if (r.url().includes("/local-upload?")) writes++;
  });
  await page.route(/\/api\/attachments\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() === "POST") {
      finalizations++;
      if (finalizations === 1) {
        await route.fetch();
        await route.fulfill({
          status: 503,
          json: { error: "Temporary finalize response failure" },
        });
        return;
      }
    }
    await route.continue();
  });

  const input = editor.locator(".draft-attachments input[type=file]");
  // Use the attachment field actually present in the task composer.
  const fileInput = (await input.count())
    ? input
    : editor.locator("input[type=file]");
  await selectOption(editor.getByLabel("Draft document purpose"), "Reference");
  await fileInput.setInputFiles({
    name: "Managed cancelled.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Cancelled upload"),
  });
  await expect(editor.locator(".file-transfer")).toContainText("Uploading");
  await editor
    .getByRole("button", { name: "Cancel upload", exact: true })
    .click();
  await expect(
    editor.getByText("Upload cancelled. Retry or remove this file.", {
      exact: true,
    }),
  ).toBeVisible();
  release();
  writes = 0;
  await selectOption(editor.getByLabel("Draft document purpose"), "Reference");
  await fileInput.setInputFiles({
    name: "Managed retried.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Original uploaded once"),
  });
  await expect(
    editor.getByText("Managed retried.txt", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => finalizations).toBe(2);
  expect(writes).toBe(1);
});
