import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
test("RUPTL links open both independent room records and remain usable on phones", async ({
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
  const code = `LINK-${Date.now()}`;
  const board = await page.request.post("/api/board-room", {
    headers: { origin },
    data: {
      action: "saveProject",
      values: {
        externalId: code,
        name: `Board ${code}`,
        category: "Pembangkit",
      },
    },
  });
  expect(board.ok(), await board.text()).toBeTruthy();
  const { project } = await board.json();
  const locker = await page.request.post("/api/workspace", {
    headers: { origin },
    data: { action: "createProject", name: `Locker ${code}`, reference: code },
  });
  expect(locker.ok(), await locker.text()).toBeTruthy();
  const result = await locker.json();
  const workspace = await (await page.request.get("/api/workspace")).json();
  const lockerProject =
    result.project ||
    workspace.projects.find((p: { reference: string }) => p.reference === code);
  expect(lockerProject).toBeTruthy();
  await page.goto(`/board-room/projects/${project.id}`);
  const section = page.getByRole("region", { name: "Connected room projects" });
  await expect(
    section.getByRole("link", { name: `Locker ${code}` }),
  ).toBeVisible();
  await section.getByRole("link", { name: `Locker ${code}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`section=project&project=${lockerProject.id}`),
  );
  await expect(
    page
      .getByRole("region", { name: "Connected room projects" })
      .getByRole("link", { name: `Board ${code}` }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("region", { name: "Connected room projects" }),
  ).toHaveCount(1);
  await page
    .getByRole("region", { name: "Connected room projects" })
    .getByRole("link", { name: `Board ${code}` })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/board-room/projects/${project.id}`),
  );
  await expect(
    page
      .getByRole("region", { name: "Connected room projects" })
      .getByRole("link", { name: `Locker ${code}` }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  const readback = await (
    await page.request.get(`/api/board-room?id=${project.id}`)
  ).json();
  expect(readback.project.version).toBe(1);
});
test("cross-room endpoint requires an application session", async ({
  request,
}) => {
  const response = await request.get(
    `/api/projects/related?room=board&id=${crypto.randomUUID()}`,
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});
