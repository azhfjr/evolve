import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
for (const room of ["locker", "board"])
  test(`${room} invitation keeps a clear handoff and account registration status`, async ({
    page,
    context,
  }) => {
    await signIn(context);
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
    await page.goto(
      room === "board" ? "/board-room?section=people" : "/app?section=people",
    );
    if (room === "locker")
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name: "People", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Invite teammate", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const email = `handoff-${room}-${Date.now()}@example.com`;
    await dialog
      .getByLabel("Full name", { exact: true })
      .fill(`Handoff ${room}`);
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
      dialog.getByRole("textbox", { name: "Sign-in link", exact: true }),
    ).toBeFocused();
    const instructions = dialog.getByRole("textbox", {
      name: "Onboarding instructions",
      exact: true,
    });
    await expect(instructions).toContainText(email);
    await expect(instructions).toContainText("http://127.0.0.1:3100/workspace");
    await dialog
      .getByRole("button", { name: "Copy instructions", exact: true })
      .click();
    await expect(
      dialog.getByText(
        "Copy unavailable. Select the text below and copy it manually.",
        { exact: true },
      ),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    const card = page.locator(".person-card").filter({
      has: page.getByRole("heading", {
        name: `Handoff ${room}`,
        exact: true,
      }),
    });
    await expect(
      card.getByText("Approved · Account not registered", { exact: true }),
    ).toBeVisible();
    const report = await (await page.request.get("/api/administration")).json();
    expect(
      report.sessions.find((s: { email: string }) => s.email === email)
        .accountRegistered,
    ).toBe(false);
    expect(
      report.sessions.find(
        (s: { email: string }) => s.email === "member@example.com",
      ).accountRegistered,
    ).toBe(true);
  });
