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
test("admin checks operations and saves evidence with conflict-safe drafts", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context);
  await page.goto("/workspace");
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Operations readiness", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Dashboard monitoring only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/This dashboard cannot detect a full-site outage/),
  ).toBeVisible();
  await expect(
    page.getByText(/Production recovery is unverified/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run check", exact: true }).click();
  await expect(
    page.locator(".operations-panel").getByRole("status"),
  ).toHaveText("Current database and background-work signals checked.");
  const reference = page.getByRole("textbox", {
    name: "Evidence reference / scope",
  });
  const record = `LocalReference${"x".repeat(450)}`;
  await reference.fill(record);
  // A concurrent tab changes the singleton version while the form is open.
  const before = await (await page.request.get("/api/operations")).json();
  const concurrent = await page.request.post("/api/operations", {
    headers: { origin },
    data: { action: "runCheck", version: before.version },
  });
  expect(concurrent.ok(), await concurrent.text()).toBeTruthy();
  await page
    .getByRole("button", { name: "Save reported evidence", exact: true })
    .click();
  await expect(
    page.locator(".operations-panel").getByRole("alert"),
  ).toContainText("Operations changed");
  await expect(reference).toHaveValue(record);
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect(
    page.locator(".operations-panel").getByRole("alert"),
  ).toHaveCount(0);
  await expect(reference).toHaveValue(record);
  await page
    .getByRole("button", { name: "Save reported evidence", exact: true })
    .click();
  await expect(
    page.locator(".operations-panel").getByRole("status"),
  ).toHaveText("Admin-reported recovery evidence saved.");
  const saved = await (await page.request.get("/api/operations")).json();
  expect(saved.state.evidence.reference).toBe(record);
  expect(saved.state.evidence.recordedBy).toBe("jarjirjor777@gmail.com");
  expect(saved.recovery.productionRestoreVerified).toBe(false);
  expect(saved.recovery.providerRetentionVerified).toBe(false);
  if (saved.signals.length && !saved.acknowledged) {
    await page
      .getByRole("button", {
        name: "Acknowledge current incident",
        exact: true,
      })
      .click();
    await expect(
      page.locator(".operations-panel").getByRole("status"),
    ).toHaveText("Incident acknowledged. Active conditions remain visible.");
    await expect(page.getByText(/Conditions remain active/)).toBeVisible();
  }
  await page.reload();
  await expect(reference).toHaveValue(record);
  await expect(
    page.getByText("Admin-reported; independently unverified", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("operations-desktop.png"),
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Operations readiness", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`operations-phone-${width}.png`),
      fullPage: true,
    });
  }
});
test("operations remains admin-only at navigation, API and page boundaries", async ({
  page,
  context,
}) => {
  expect((await page.request.get("/api/operations")).status()).toBe(401);
  await signIn(context, "e2e-member");
  await page.goto("/workspace");
  await expect(
    page.getByRole("link", { name: "Operations", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/operations")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/operations", {
        headers: { origin },
        data: { action: "runCheck", version: 1 },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/workspace/operations");
  await expect(
    page.getByRole("button", { name: "Run check", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Only the workspace administrator can do that.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("operations GET failure can be retried without losing the evidence draft", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/workspace/operations");
  const reference = page.getByRole("textbox", {
    name: "Evidence reference / scope",
  });
  await reference.fill(
    "Preserve this evidence draft on a temporary check failure",
  );
  await page.route("**/api/operations", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary operations failure" }),
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect(
    page.locator(".operations-panel").getByRole("alert"),
  ).toContainText("Temporary operations failure");
  await expect(reference).toHaveValue(
    "Preserve this evidence draft on a temporary check failure",
  );
  await page.unroute("**/api/operations");
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect(
    page.locator(".operations-panel").getByRole("alert"),
  ).toHaveCount(0);
  await expect(reference).toHaveValue(
    "Preserve this evidence draft on a temporary check failure",
  );
});

test("recovery evidence cannot be edited while its save is in flight", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/workspace/operations");
  const reference = page.getByRole("textbox", {
    name: "Evidence reference / scope",
  });
  await reference.fill("Evidence being saved must not overwrite later typing.");
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    pending = new Promise<void>((resolve) => {
      started = resolve;
    });
  await page.route("**/api/operations", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "saveEvidence"
    ) {
      started();
      await gate;
    }
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Save reported evidence", exact: true })
      .click();
    await pending;
    await expect(reference).toBeDisabled();
    release();
    await expect(
      page.locator(".operations-panel").getByRole("status"),
    ).toHaveText("Admin-reported recovery evidence saved.");
    await expect(reference).toBeEnabled();
    await expect(reference).toHaveValue(
      "Evidence being saved must not overwrite later typing.",
    );
  } finally {
    release();
  }
});
