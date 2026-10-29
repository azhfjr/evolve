import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("Board deep links reuse server detail without fetching it a second time", async ({
  page,
  context,
}) => {
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
  const r = await page.request.post("/api/board-room", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      action: "saveProject",
      values: { externalId: `PRELOAD-${Date.now()}`, name: "Preloaded detail" },
    },
  });
  expect(r.ok()).toBe(true);
  const { project } = await r.json();
  let repeated = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/board-room" &&
      url.searchParams.get("id") === project.id
    )
      repeated++;
  });
  await page.goto(`/board-room/projects/${project.id}`);
  await expect(
    page.getByRole("textbox", { name: "Progress review note", exact: true }),
  ).toBeVisible();
  expect(repeated).toBe(0);
});
