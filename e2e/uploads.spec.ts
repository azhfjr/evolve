import { selectOption } from "./ui-helpers";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
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
test("document upload UI persists a task attachment and recovers from rejected file types", async ({
  context,
  page,
}) => {
  await signIn(context);
  const create = await page.request.post("/api/workspace", {
    headers: { origin },
    data: { action: "createTask", task: { title: "Upload UI task" } },
  });
  const task = (await create.json()).task;
  await page.goto(`/app?task=${task.id}`);
  const section = page.getByRole("region", {
    name: "Document attachments",
    exact: true,
  });
  await selectOption(section.getByLabel("Upload purpose"), "Reference");
  await section
    .getByLabel("Upload task attachment", { exact: true })
    .setInputFiles({
      name: "Team brief.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("A real task attachment"),
    });
  await expect(
    section.getByText("Team brief.txt", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    section.getByText("Team brief.txt", { exact: true }),
  ).toBeVisible();
  await selectOption(section.getByLabel("Upload purpose"), "Reference");
  await section
    .getByLabel("Upload task attachment", { exact: true })
    .setInputFiles({
      name: "Unsafe.html",
      mimeType: "text/html",
      buffer: Buffer.from("<script>bad()</script>"),
    });
  await expect(section.getByRole("alert")).toContainText(
    "The document type is unsupported",
  );
  await expect(
    section.getByText("Team brief.txt", { exact: true }),
  ).toBeVisible();
});
test("avatar and workspace logo upload UI save valid private images and persist after reload", async ({
  context,
  page,
}) => {
  await signIn(context);
  await page.goto("/app?section=settings");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#416b52";
    ctx.fillRect(0, 0, 16, 16);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  for (const tab of ["My account", "Workspace"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.locator(".image-upload-row input[type=file]").setInputFiles({
      name: "Evolve.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    const label = tab === "My account" ? "Profile photo" : "Workspace logo";
    await expect(
      page.getByRole("img", { name: label, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: label, exact: true })
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBe(16);
    await page
      .getByRole("button", {
        name: tab === "My account" ? "Save account settings" : "Save workspace",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        tab === "My account" ? "Account settings saved" : "Workspace updated",
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("img", { name: label, exact: true }),
    ).toBeVisible();
  }
});
