import { selectOption } from "./ui-helpers";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
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
test("shared and app settings show reconciled usage cards, readable on phones", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  for (const path of [
    "/workspace/settings?tab=files",
    "/app?section=files",
    "/board-room?section=files",
  ]) {
    await page.goto(path);
    const summary = page.getByRole("region", {
      name: "Shared workspace storage",
    });
    await expect(
      summary.getByRole("heading", { name: "Workspace storage" }),
    ).toBeVisible();
    for (const name of ["Locker Room", "Board Room", "Shared assets"])
      await expect(
        summary.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    await expect(
      summary.getByRole("link", { name: "Manage Board Room files" }),
    ).toHaveAttribute("href", "/board-room?section=files");
    await expect(summary.getByText(/remaining for both apps/)).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width);
      const cards = summary.locator(".storage-usage-card");
      await expect(cards).toHaveCount(3);
      for (const card of await cards.all())
        expect((await card.boundingBox())!.width).toBeGreaterThan(180);
      if (path.startsWith("/workspace"))
        await page.screenshot({
          path: info.outputPath(`storage-${width}.png`),
          fullPage: true,
        });
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".file-storage-overview")
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});
test("Locker project exposes Documents and an accessible upload input", async ({
  page,
  context,
}) => {
  await signIn(context);
  const data = await (await page.request.get("/api/workspace")).json();
  const id = data.projects[0].id;
  await page.goto(`/app?section=project&project=${id}`);
  await expect(page.getByRole("heading", { name: /Documents/ })).toBeVisible();
  await expect(
    page.getByLabel("Upload project document", { exact: true }),
  ).toHaveCount(1);
});

test("new Locker project offers a direct document handoff", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app?section=projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill(`Document handoff ${Date.now()}`);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add documents", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Documents/ })).toBeVisible();
  await expect(page).toHaveURL(/section=project/);
  await expect(page.locator("#project-documents")).toBeFocused();
});

test("Locker project documents upload privately, persist, download and delete", async ({
  page,
  context,
}) => {
  await signIn(context);
  const data = await (await page.request.get("/api/workspace")).json();
  const id = data.projects[0].id;
  await page.goto(`/app?section=project&project=${id}`);
  const documents = page.locator(".project-attachments");
  const name = `Project-evidence-${Date.now()}.txt`;
  const reserved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/attachments") && r.request().method() === "POST",
  );
  await selectOption(documents.getByLabel("Upload purpose"), "Reference");
  await documents
    .getByLabel("Upload project document", { exact: true })
    .setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from("Private project evidence"),
    });
  expect((await (await reserved).json()).provider).toBe("local");
  await expect(documents.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(documents.getByText(name, { exact: true })).toBeVisible();
  const transfer = page.waitForEvent("download");
  await documents
    .getByRole("button", { name: `Download ${name}`, exact: true })
    .click();
  const download = await transfer;
  expect(await readFile((await download.path())!, "utf8")).toBe(
    "Private project evidence",
  );
  await documents
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await documents
    .getByRole("group")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(documents.locator("li").filter({ hasText: name })).toHaveCount(
    0,
  );
});

test("failed storage readings stop loading and can be retried", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.route("**/api/attachments/manage?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Storage temporarily unavailable" }),
    }),
  );
  await page.goto("/workspace/settings?tab=files");
  const summary = page.getByRole("region", {
    name: "Shared workspace storage",
  });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Storage temporarily unavailable" }),
  ).toBeVisible();
  await expect(summary).toHaveAttribute("aria-busy", "false");
  await expect(summary.getByText("Storage usage unavailable.")).toBeVisible();
  await page.unroute("**/api/attachments/manage?**");
  await page
    .getByRole("button", { name: "Refresh files", exact: true })
    .click();
  await expect(summary.getByText(/remaining for both apps/)).toBeVisible();
});
