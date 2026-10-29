import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { relatedRoomProjects } from "../src/lib/project-room-links";
import type { Actor } from "../src/lib/types";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "links-admin@example.com";
const admin: Actor = {
  email: "links-admin@example.com",
  name: "Admin",
  isAdmin: true,
};
const member: Actor = {
  email: "links-member@example.com",
  name: "Member",
  isAdmin: false,
};
const inactive: Actor = {
  email: "links-inactive@example.com",
  name: "Inactive",
  isAdmin: false,
};
const boardId = crypto.randomUUID(),
  lockerId = crypto.randomUUID(),
  duplicateId = crypto.randomUUID();
let directory: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "evolve-links-"));
  process.env.EVOLVE_DATA_DIR = join(directory, "db");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await (
      db as unknown as {
        $client: { exec: (source: string) => Promise<unknown> };
      }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  }
  await db.insert(s.member).values([
    { email: member.email, name: member.name },
    { email: inactive.email, name: inactive.name, disabled: true },
  ]);
  await db.insert(s.project).values([
    { id: lockerId, name: "Locker project", reference: " KAL-001 " },
    { id: duplicateId, name: "Second Locker match", reference: "kal-001" },
    {
      id: crypto.randomUUID(),
      name: "Substring does not match",
      reference: "KAL-001-extra",
    },
    { id: crypto.randomUUID(), name: "No code", reference: "" },
  ]);
  await db.insert(s.boardRoomProject).values({
    id: boardId,
    externalId: "KAL-001",
    data: {
      externalId: "KAL-001",
      name: "Board project",
      category: "Pembangkit",
      capacity: 100,
      unit: "MW",
      startYear: 2026,
      codYear: 2028,
      description: "",
      location: "",
      links: [],
      linkLabels: [],
      scope: "",
      voltage: "",
      stage: 0,
      completed: false,
    },
  });
});
after(async () => {
  await (await database()).close();
  await rm(directory, { recursive: true, force: true });
});
test("links find exact normalized RUPTL codes and show all duplicate matches without merging", async () => {
  const linked = await relatedRoomProjects(member, {
    room: "board",
    id: boardId,
  });
  assert.equal(linked.code, "KAL-001");
  assert.equal(linked.projects.length, 2);
  assert.deepEqual(
    new Set(linked.projects.map((p) => p.id)),
    new Set([lockerId, duplicateId]),
  );
  assert.ok(
    linked.projects.every((p) =>
      p.href.startsWith("/app?section=project&project="),
    ),
  );
  const reverse = await relatedRoomProjects(admin, {
    room: "locker",
    id: lockerId,
  });
  assert.equal(reverse.projects[0].id, boardId);
  assert.equal(reverse.projects[0].href, `/board-room/projects/${boardId}`);
  const { db } = await database();
  assert.equal((await db.select().from(s.project)).length, 4);
  assert.equal((await db.select().from(s.boardRoomProject))[0].version, 1);
});
test("cross-room links reject inactive membership and nonexistent source records", async () => {
  await assert.rejects(
    relatedRoomProjects(inactive, { room: "board", id: boardId }),
    { status: 403 },
  );
  await assert.rejects(
    relatedRoomProjects(admin, { room: "locker", id: crypto.randomUUID() }),
    { status: 404 },
  );
  await assert.rejects(
    relatedRoomProjects(admin, { room: "locker", id: "invalid" }),
  );
});
test("blank RUPTL codes never match unrelated empty records", async () => {
  const { db } = await database();
  const [empty] = (await db.select().from(s.project)).filter(
    (p) => !p.reference,
  );
  const linked = await relatedRoomProjects(member, {
    room: "locker",
    id: empty.id,
  });
  assert.deepEqual(linked.projects, []);
  assert.equal(linked.code, "");
});
