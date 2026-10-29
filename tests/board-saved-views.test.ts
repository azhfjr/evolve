import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import {
  readBoardViews,
  boardViewCommand,
} from "../src/lib/board-room/saved-views";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "views-admin@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true },
  member = {
    email: "views-member@example.test",
    name: "Member",
    isAdmin: false,
  },
  limited = { ...member, email: "views-limit@example.test" };
let directory: string;
const filters = {
  query: { category: "Pembangkit", year: "2028", stage: "3", page: 99 },
  section: "projects",
  view: "table",
};
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "evolve-views-"));
  process.env.EVOLVE_DATA_DIR = join(directory, "db");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (s: string) => Promise<unknown> } }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  await db
    .insert(s.member)
    .values(
      [admin, member, limited].map((a) => ({ email: a.email, name: a.name })),
    );
});
after(async () => {
  await (await database()).close();
  await rm(directory, { recursive: true, force: true });
});
test("members save only their own views without mutating portfolio configuration", async () => {
  const { view } = await boardViewCommand(member, "create", {
    name: "Member view",
    filters,
  });
  assert.ok(view);
  assert.equal("page" in view.filters.query, false);
  assert.equal(view.filters.query.category, "Pembangkit");
  assert.equal((await readBoardViews(admin)).views.length, 0);
  assert.equal((await readBoardViews(member)).views.length, 1);
  const { db } = await database();
  assert.equal((await db.select().from(s.boardRoomConfig))[0].revision, 0);
});
test("ownership, case-insensitive names and optimistic updates are enforced", async () => {
  const { view } = await boardViewCommand(admin, "create", {
    name: "Ownership",
    filters,
  });
  assert.ok(view);
  await assert.rejects(
    boardViewCommand(member, "update", {
      id: view.id,
      version: view.version,
      name: "Stolen",
    }),
    { status: 404 },
  );
  await assert.rejects(
    boardViewCommand(member, "delete", { id: view.id, version: view.version }),
    { status: 404 },
  );
  await assert.rejects(
    boardViewCommand(admin, "create", { name: "ownership", filters }),
    { status: 409 },
  );
  const updated = await boardViewCommand(admin, "update", {
    id: view.id,
    version: view.version,
    name: "Renamed",
    filters: { query: { validation: "review" } },
  });
  assert.ok(updated.view);
  assert.equal(updated.view.filters.query.validation, "review");
  await assert.rejects(
    boardViewCommand(admin, "delete", { id: view.id, version: view.version }),
    { status: 409 },
  );
  await boardViewCommand(admin, "delete", {
    id: view.id,
    version: updated.view.version,
  });
  assert.equal((await readBoardViews(admin)).views.length, 0);
});
test("concurrent view creation cannot exceed the twenty-view quota", async () => {
  const attempts = await Promise.allSettled(
    Array.from({ length: 21 }, (_, i) =>
      boardViewCommand(limited, "create", { name: `View ${i}`, filters: {} }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 20);
  assert.equal((await readBoardViews(limited)).views.length, 20);
});
test("disabled members and forged administrators cannot read personal views", async () => {
  const { db } = await database();
  await db
    .update(s.member)
    .set({ disabled: true })
    .where(eq(s.member.email, member.email));
  await assert.rejects(readBoardViews(member), { status: 403 });
  await assert.rejects(
    readBoardViews({ ...admin, email: "forged@example.test" }),
    { status: 403 },
  );
});
