import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
process.env.DATABASE_URL = "";
process.env.BLOB_READ_WRITE_TOKEN = "";
process.env.ADMIN_EMAIL = "hub-admin@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true },
  member = { email: "hub-member@example.test", name: "Member", isAdmin: false };
let dir: string;
const projectId = crypto.randomUUID();
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-hub-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  const { db } = await database();
  for (const n of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (q: string) => Promise<unknown> } }
    ).$client.exec(await readFile("migrations/" + n, "utf8"));
  await db
    .insert(s.member)
    .values([admin, member].map((a) => ({ email: a.email, name: a.name })));
  const { projectSchema } = await import("../src/lib/board-room/model");
  await db.insert(s.boardRoomProject).values({
    id: projectId,
    externalId: "HUB-1",
    data: {
      ...projectSchema.parse({ externalId: "HUB-1", name: "Hub project" }),
      stage: 0,
      completed: false,
    },
  });
  const t = await import("../src/lib/connected/transition");
  const p = await t.transitionPreview(admin);
  await t.activateConnectedWorkspace(admin, {
    token: p.token,
    recoveryEvidence: "Disposable test recovery evidence",
  });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("draft envelopes expire, isolate accounts and reject file bodies", async () => {
  const d = await import("../src/lib/connected/drafts");
  const key = d.formDraftKey(member.email, "asset", "new");
  assert.notEqual(key, d.formDraftKey(admin.email, "asset", "new"));
  const raw = d.encodeFormDraft(
    { name: "Draft", files: new Uint8Array([1, 2]) },
    1000,
  );
  assert.deepEqual(d.decodeFormDraft(raw, 1001), { name: "Draft" });
  assert.equal(d.decodeFormDraft(raw, 1000 + 8 * 86400000), null);
});
test("search and project hub reflect canonical tasks, assets and private boundaries", async () => {
  const { executeCommand } = await import("../src/lib/service");
  await executeCommand(member, {
    action: "createTask",
    task: {
      title: "Hub follow-up",
      projectId,
      assignee: member.email,
      dueDate: "2020-01-01",
    },
  });
  const { projectHub, unifiedSearch, personalActions } =
    await import("../src/lib/connected/workspace");
  assert.equal((await projectHub(member, projectId)).counts.overdue, 1);
  assert.equal((await projectHub(member, projectId)).assetCount, 0);
  assert.equal((await projectHub(member, projectId)).documentCount, 0);
  assert.ok(
    (await unifiedSearch(member, { q: "Hub" })).items.some(
      (i) => i.kind === "task",
    ),
  );
  assert.equal((await personalActions(member)).tasks.length, 1);
});
test("retired meeting snapshots remain immutable and existing tasks remain available", async () => {
  const { db } = await database();
  const id = crypto.randomUUID();
  await db.execute(
    sql`INSERT INTO meeting_pack(id,request_id,actor,title,snapshot) VALUES(${id},${crypto.randomUUID()},${member.email},'Historical pack','{}'::jsonb)`,
  );
  const before = await db.select().from(s.task);
  await assert.rejects(
    db.execute(sql`UPDATE meeting_pack SET title='Changed' WHERE id=${id}`),
  );
  assert.equal((await db.select().from(s.task)).length, before.length);
});
test("canonical subtasks inherit projects, dependencies reject cycles and bulk completion validates final state", async () => {
  const { executeCommand } = await import("../src/lib/service");
  const parent = (
    await executeCommand(member, {
      action: "createTask",
      task: { title: "Parent work", projectId },
    })
  ).task!;
  const child = (
    await executeCommand(member, {
      action: "createTask",
      task: { title: "Child work", parentId: parent.id },
    })
  ).task!;
  assert.equal(child.projectId, projectId);
  const prerequisite = (
    await executeCommand(member, {
      action: "createTask",
      task: { title: "Prerequisite", projectId },
    })
  ).task!;
  const dependent = (
    await executeCommand(member, {
      action: "createTask",
      task: {
        title: "Dependent work",
        projectId,
        dependencies: [prerequisite.id],
      },
    })
  ).task!;
  await assert.rejects(
    executeCommand(member, {
      action: "updateTask",
      id: prerequisite.id,
      version: 1,
      patch: { dependencies: [dependent.id] },
    }),
    /cycle|siklus/i,
  );
  await assert.rejects(
    executeCommand(member, {
      action: "updateTask",
      id: parent.id,
      version: 1,
      patch: { status: "done" },
    }),
    /subtask|penghambat/i,
  );
  await executeCommand(member, {
    action: "bulkUpdateTasks",
    idempotencyKey: crypto.randomUUID(),
    items: [
      { id: dependent.id, version: 1 },
      { id: prerequisite.id, version: 1 },
    ],
    patch: { status: "done" },
  });
  const { db } = await database();
  assert.equal(
    (await db.select().from(s.task)).find((t) => t.id === dependent.id)?.status,
    "done",
  );
});
test("task-free hub excludes task reads and previews", async () => {
  const { projectHub } = await import("../src/lib/connected/workspace");
  const data = await projectHub(member, projectId, false);
  assert.deepEqual(data.tasks, []);
  assert.equal(data.counts.total, 0);
});

test("search total survives a page beyond the last matching record", async () => {
  const { unifiedSearch } = await import("../src/lib/connected/workspace");
  const first = await unifiedSearch(member, { q: "Hub", page: 1 });
  assert.ok(first.total > 0);
  assert.equal(
    (first.items[0] as unknown as { total: number }).total,
    first.total,
  );
  const beyond = await unifiedSearch(member, { q: "Hub", page: 999999 });
  assert.equal(beyond.items.length, 0);
  assert.equal(beyond.total, first.total);
});

test("personal action pagination exposes complete totals and independent pages", async () => {
  const { db } = await database();
  await db.execute(
    sql`INSERT INTO task(id,title,project_id,assignee,created_by) SELECT gen_random_uuid(),'Paged action '||i,${projectId},${member.email},${member.email} FROM generate_series(1,105) i`,
  );
  const { personalActions } = await import("../src/lib/connected/workspace");
  const first = await personalActions(member);
  const second = await personalActions(member, { tasksPage: 2 });
  assert.ok(first.pagination.tasks.total >= 105);
  assert.equal(first.tasks.length, 100);
  assert.ok(second.tasks.length > 0);
  assert.equal(second.pagination.tasks.page, 2);
  assert.ok(second.tasks.every((t) => !first.tasks.some((f) => f.id === t.id)));
  const empty = await personalActions(member, { tasksPage: 9999 });
  assert.equal(empty.tasks.length, 0);
  assert.equal(empty.pagination.tasks.total, first.pagination.tasks.total);
  await assert.rejects(personalActions(member, { tasksPage: -1 }));
});

test("action notification and review pages retain exact totals and role boundaries", async () => {
  const { db } = await database();
  await db.execute(
    sql`INSERT INTO notification(id,email,message) SELECT gen_random_uuid(),${member.email},'Paged note '||i FROM generate_series(1,105) i`,
  );
  const { personalActions } = await import("../src/lib/connected/workspace");
  const first = await personalActions(member);
  const second = await personalActions(member, { notificationsPage: 2 });
  assert.equal(first.pagination.notifications.total, 105);
  assert.equal(second.notifications.length, 5);
  assert.equal(second.pagination.notifications.total, 105);
  assert.ok(
    second.notifications.every(
      (n) => !first.notifications.some((f) => f.id === n.id),
    ),
  );
  assert.equal(second.pagination.tasks.page, 1);
  assert.equal(second.pagination.review.total, 0);
  assert.deepEqual(second.review, []);
});

test("admin review pagination exposes every pending project without leaking to members", async () => {
  const { db } = await database();
  const { projectSchema } = await import("../src/lib/board-room/model");
  const projects = Array.from({ length: 51 }, (_, i) => ({
    id: crypto.randomUUID(),
    externalId: "REVIEW-" + i,
    data: {
      ...projectSchema.parse({
        externalId: "REVIEW-" + i,
        name: "Review project " + i,
      }),
      stage: 0,
      completed: false,
    },
  }));
  await db.insert(s.boardRoomProject).values(projects);
  await db.insert(s.attachment).values(
    projects.map((p) => ({
      id: crypto.randomUUID(),
      entityType: "boardRoomProject" as const,
      entityId: p.id,
      ownerEmail: admin.email,
      filename: "review.txt",
      contentType: "text/plain",
      size: 1,
      storagePath: "review/" + p.id,
      state: "ready" as const,
    })),
  );
  const { personalActions } = await import("../src/lib/connected/workspace");
  const first = await personalActions(admin),
    second = await personalActions(admin, { reviewsPage: 2 });
  assert.equal(first.pagination.review.total, 51);
  assert.equal(first.review.length, 50);
  assert.equal(second.review.length, 1);
  assert.equal(second.pagination.review.total, 51);
  assert.ok(
    second.review.every((p) => !first.review.some((f) => f.id === p.id)),
  );
  assert.equal(
    (await personalActions(member, { reviewsPage: 2 })).pagination.review.total,
    0,
  );
});
