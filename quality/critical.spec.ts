import { selectOption } from "../e2e/ui-helpers";
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
test("personal views work by keyboard across reloads and stay private", async ({
  page,
  context,
  browser,
}, info) => {
  await signIn(context);
  const name = `Critical ${info.project.name}`;
  await page.goto("/board-room?category=Pembangkit&year=2028");
  const trigger = page.getByRole("button", {
    name: "Saved views",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Your Board saved views",
    exact: true,
  });
  await dialog.getByLabel("View name", { exact: true }).fill(name);
  await dialog
    .getByRole("button", { name: "Save current view", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: `Apply ${name}`, exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const viewBox = await dialog
    .getByRole("button", { name: `Apply ${name}`, exact: true })
    .boundingBox();
  expect(viewBox!.width).toBeGreaterThanOrEqual(180);
  expect(viewBox!.height).toBeLessThanOrEqual(90);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.goto("/board-room?category=Transmisi");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await dialog
    .getByRole("button", { name: `Apply ${name}`, exact: true })
    .click();
  await expect(page).toHaveURL(/category=Pembangkit/);
  await expect(page).toHaveURL(/year=2028/);
  const other = await browser.newContext();
  await signIn(other, "e2e-member");
  const otherViews = await (
    await other.request.get(origin + "/api/board-room/views")
  ).json();
  expect(otherViews.views.some((v: { name: string }) => v.name === name)).toBe(
    false,
  );
  await other.close();
  await page.reload();
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: `Apply ${name}`, exact: true }),
  ).toBeVisible();
});
for (const room of ["locker", "board"])
  test(`${room} handoff supports mobile keyboard and clipboard recovery`, async ({
    page,
    context,
  }, info) => {
    await signIn(context);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Clipboard denied");
          },
        },
      }),
    );
    await page.goto(room === "board" ? "/board-room?section=people" : "/app");
    if (room === "locker")
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name: "People", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Invite teammate", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const email = `critical-${room}-${info.project.name}@example.test`;
    await dialog
      .getByLabel("Full name", { exact: true })
      .fill(`Critical ${room} ${info.project.name}`);
    await dialog
      .getByLabel("Google email address", { exact: true })
      .fill(email);
    await dialog
      .getByRole("button", { name: "Approve teammate", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Teammate approved", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Sign-in link", { exact: true }),
    ).toBeFocused();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const frame = await dialog.boundingBox();
    const bodyText = await dialog
      .locator(".invitation-handoff > p")
      .first()
      .boundingBox();
    expect(bodyText!.x - frame!.x).toBeGreaterThanOrEqual(16);
    await dialog
      .getByRole("button", { name: "Copy instructions", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Copy unavailable");
    await expect(
      dialog.getByRole("textbox", {
        name: "Onboarding instructions",
        exact: true,
      }),
    ).toHaveValue(new RegExp(email));
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
test("review notes, private files and error recovery remain usable", async ({
  page,
  context,
  browser,
}, info) => {
  await signIn(context);
  const created = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: {
        externalId: `CRITICAL-${info.project.name}`,
        name: "Cross-browser evidence",
      },
    },
  });
  expect(created.ok()).toBe(true);
  const { project } = await created.json();
  await page.goto(`/board-room/projects/${project.id}`);
  const dialog = page.getByRole("dialog");
  const note = dialog.getByRole("textbox", {
    name: "Progress review note",
    exact: true,
  });
  await note.fill("Keep this review draft");
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("heading", {
      name: "Discard unsaved review notes?",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(note).toHaveValue("Keep this review draft");
  await note.fill("");
  await page.route("**/api/attachments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const reservation = await response.json();
    if (reservation.provider !== "local") {
      await route.abort();
      throw new Error(
        "Critical uploads require local storage; transfer blocked.",
      );
    }
    await route.fulfill({ response, json: reservation });
  });
  const body = "Cross-browser private document fixture";
  await dialog
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await selectOption(dialog.getByLabel("Upload document purpose"), "Reference");
  await dialog.getByLabel("Upload project document").setInputFiles({
    name: "critical-evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(body),
  });
  await expect(
    dialog.getByRole("link", { name: "critical-evidence.txt", exact: true }),
  ).toBeVisible();
  const detail = await (
    await page.request.get(`/api/board-room?id=${project.id}`)
  ).json();
  const content = await page.request.get(
    `/api/attachments/${detail.attachments[0].id}/content`,
  );
  expect(await content.text()).toBe(body);
  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.get(
        origin + `/api/attachments/${detail.attachments[0].id}/content`,
      )
    ).status(),
  ).toBe(401);
  await anonymous.close();
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", {
      name: "Download critical-evidence.txt",
      exact: true,
    })
    .click();
  expect((await downloaded).suggestedFilename()).toBe("critical-evidence.txt");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
