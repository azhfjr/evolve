import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import {
  reserveAttachment,
  writeLocalAttachment,
  finalizeAttachment,
  listAttachments,
} from "../src/lib/attachments";
process.env.DATABASE_URL = "";
process.env.BLOB_READ_WRITE_TOKEN = "";
process.env.EVOLVE_LOCAL_FILES = "1";
process.env.ADMIN_EMAIL = "versions@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true },
  member = {
    email: "version-member@example.test",
    name: "Member",
    isAdmin: false,
  };
let dir: string;
const project = crypto.randomUUID();
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-versions-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  process.env.EVOLVE_FILES_DIR = join(dir, "files");
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
    id: project,
    externalId: "VERSION-1",
    data: {
      ...projectSchema.parse({
        externalId: "VERSION-1",
        name: "Version project",
      }),
      stage: 0,
      completed: false,
    },
  });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("replacement keeps old current until verified, retains history and rejects stale finalization", async () => {
  const { documentHistory, restoreDocumentVersion } =
    await import("../src/lib/document-versions");
  const first = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "original.txt",
    contentType: "text/plain",
    size: 3,
  });
  await writeLocalAttachment(admin, first.id, Buffer.from("one"));
  const ready = await finalizeAttachment(admin, first.id);
  assert.ok(ready.documentId);
  const values = {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "replacement.txt",
    contentType: "text/plain",
    size: 3,
    replaceDocumentId: ready.documentId,
    expectedCurrentId: first.id,
  };
  const a = await reserveAttachment(admin, values),
    b = await reserveAttachment(admin, values);
  assert.equal(
    (await listAttachments(member, "boardRoomProject", project))[0].id,
    first.id,
  );
  await writeLocalAttachment(admin, a.id, Buffer.from("two"));
  await finalizeAttachment(admin, a.id);
  await writeLocalAttachment(admin, b.id, Buffer.from("bad"));
  await assert.rejects(finalizeAttachment(admin, b.id), /changed/i);
  const history = await documentHistory(member, a.id);
  assert.equal(history.versions.length, 2);
  assert.equal(history.currentId, a.id);
  assert.equal(
    (await listAttachments(member, "boardRoomProject", project)).length,
    1,
  );
  await assert.rejects(
    restoreDocumentVersion(member, { id: first.id, expectedCurrentId: a.id }),
    /admin/i,
  );
  await restoreDocumentVersion(admin, {
    id: first.id,
    expectedCurrentId: a.id,
  });
  assert.equal(
    (await listAttachments(admin, "boardRoomProject", project))[0].id,
    first.id,
  );
});

test("deleting the current version rejects an already pending replacement", async () => {
  const { removeAttachment } = await import("../src/lib/attachments");
  const a = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "delete-original.txt",
    contentType: "text/plain",
    size: 3,
  });
  await writeLocalAttachment(admin, a.id, Buffer.from("old"));
  const ready = await finalizeAttachment(admin, a.id);
  const b = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "pending.txt",
    contentType: "text/plain",
    size: 3,
    replaceDocumentId: ready.documentId!,
    expectedCurrentId: a.id,
  });
  await writeLocalAttachment(admin, b.id, Buffer.from("new"));
  await removeAttachment(admin, a.id);
  await assert.rejects(finalizeAttachment(admin, b.id), /changed/i);
});

test("deletion rechecks historical-version permission after acquiring its transaction lock", async () => {
  const { removeAttachment } = await import("../src/lib/attachments");
  const { db } = await database();
  const p = crypto.randomUUID(),
    t = crypto.randomUUID();
  await db.insert(s.project).values({ id: p, name: "Version ownership" });
  await db.insert(s.task).values({
    id: t,
    title: "Version ownership task",
    projectId: p,
    createdBy: member.email,
  });
  const a = await reserveAttachment(member, {
    entityType: "task",
    entityId: t,
    filename: "owned.txt",
    contentType: "text/plain",
    size: 3,
  });
  await writeLocalAttachment(member, a.id, Buffer.from("old"));
  const ready = await finalizeAttachment(member, a.id);
  const b = await reserveAttachment(member, {
    entityType: "task",
    entityId: t,
    filename: "new-owned.txt",
    contentType: "text/plain",
    size: 3,
    replaceDocumentId: ready.documentId!,
    expectedCurrentId: a.id,
  });
  await writeLocalAttachment(member, b.id, Buffer.from("new"));
  const original = db.transaction.bind(db);
  let intercept = true;
  db.transaction = (async (...args: Parameters<typeof db.transaction>) => {
    if (intercept) {
      intercept = false;
      await finalizeAttachment(member, b.id);
    }
    return original(...args);
  }) as typeof db.transaction;
  try {
    await assert.rejects(removeAttachment(member, a.id), /admin/i);
  } finally {
    db.transaction = original;
  }
});

test("replacement reservation retries reuse one allocation and reject changed request payloads", async () => {
  const first = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "idempotent-original.txt",
    contentType: "text/plain",
    size: 3,
  });
  await writeLocalAttachment(admin, first.id, Buffer.from("old"));
  const ready = await finalizeAttachment(admin, first.id);
  const input = {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "idempotent-new.txt",
    contentType: "text/plain",
    size: 3,
    replaceDocumentId: ready.documentId!,
    expectedCurrentId: first.id,
    requestId: crypto.randomUUID(),
  };
  const a = await reserveAttachment(admin, input),
    b = await reserveAttachment(admin, input);
  assert.equal(a.id, b.id);
  await assert.rejects(
    reserveAttachment(admin, { ...input, filename: "changed-request.txt" }),
    /changed|different/i,
  );
  await writeLocalAttachment(admin, a.id, Buffer.from("new"));
  await finalizeAttachment(admin, a.id);
  const replay = await reserveAttachment(admin, input);
  assert.equal(replay.id, a.id);
  assert.equal(replay.file?.id, a.id);
  const { removeAttachment } = await import("../src/lib/attachments");
  await assert.rejects(
    removeAttachment(admin, a.id, undefined, true),
    /completed|changed/i,
  );
});

test("document dates are optional calendar metadata, preserve review and survive replacement/restoration", async () => {
  const { updateDocumentMetadata, projectStoryline } =
    await import("../src/lib/project-storyline");
  const { documentHistory, restoreDocumentVersion } =
    await import("../src/lib/document-versions");
  const { sql } = await import("drizzle-orm");
  const { db } = await database();
  const first = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "dated.txt",
    contentType: "text/plain",
    size: 3,
    documentDate: "2028-02-29",
  });
  await writeLocalAttachment(admin, first.id, Buffer.from("one"));
  const ready = await finalizeAttachment(admin, first.id);
  const listed = (
    await listAttachments(member, "boardRoomProject", project)
  ).find((f) => f.id === first.id)!;
  assert.equal(listed.documentDate, "2028-02-29");
  assert.ok(listed.documentVersion);
  await db.execute(
    sql`UPDATE board_room_project SET reviewed_revision=document_revision WHERE id=${project}`,
  );
  const before = (
    await db.execute(
      sql`SELECT document_revision,reviewed_revision FROM board_room_project WHERE id=${project}`,
    )
  ).rows[0];
  await assert.rejects(
    updateDocumentMetadata(member, first.id, {
      documentDate: "2029-01-01",
      expectedDocumentVersion: listed.documentVersion,
    }),
    /admin/i,
  );
  const updated = await updateDocumentMetadata(admin, first.id, {
    documentDate: "2029-01-01",
    expectedDocumentVersion: listed.documentVersion,
  });
  assert.equal(updated.documentDate, "2029-01-01");
  const after = (
    await db.execute(
      sql`SELECT document_revision,reviewed_revision FROM board_room_project WHERE id=${project}`,
    )
  ).rows[0];
  assert.deepEqual(after, before);
  await assert.rejects(
    updateDocumentMetadata(admin, first.id, {
      documentDate: null,
      expectedDocumentVersion: listed.documentVersion,
    }),
    /changed/i,
  );
  await assert.rejects(
    reserveAttachment(admin, {
      entityType: "boardRoomProject",
      entityId: project,
      filename: "bad-date.txt",
      contentType: "text/plain",
      size: 3,
      documentDate: "2029-02-29",
    }),
  );
  const next = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "dated-revision.txt",
    contentType: "text/plain",
    size: 3,
    replaceDocumentId: ready.documentId,
    expectedCurrentId: first.id,
  });
  await writeLocalAttachment(admin, next.id, Buffer.from("two"));
  await finalizeAttachment(admin, next.id);
  const story = await projectStoryline(member, project, {});
  assert.equal(
    story.items.filter((f) => f.documentId === ready.documentId).length,
    1,
  );
  assert.equal(
    story.items.find((f) => f.id === next.id)?.documentDate,
    "2029-01-01",
  );
  await restoreDocumentVersion(admin, {
    id: first.id,
    expectedCurrentId: next.id,
  });
  assert.equal(
    (await listAttachments(member, "boardRoomProject", project)).find(
      (f) => f.id === first.id,
    )?.documentDate,
    "2029-01-01",
  );
  assert.equal((await documentHistory(member, first.id)).versions.length, 2);
  const undated = await updateDocumentMetadata(admin, first.id, {
    documentDate: null,
    expectedDocumentVersion: (
      await listAttachments(member, "boardRoomProject", project)
    ).find((f) => f.id === first.id)!.documentVersion,
  });
  assert.equal(undated.documentDate, null);
  assert.ok(
    (await projectStoryline(member, project, { group: "undated" })).items.some(
      (f) => f.id === first.id,
    ),
  );
});

test("Storyline pagination reconciles complete counts, orders ties, excludes tasks and rejects stale cursors", async () => {
  const { projectStoryline } = await import("../src/lib/project-storyline");
  const { sql } = await import("drizzle-orm");
  const { projectSchema } = await import("../src/lib/board-room/model");
  const { db } = await database();
  const id = crypto.randomUUID();
  await db.insert(s.boardRoomProject).values({
    id,
    externalId: "STORY-PAGES",
    data: {
      ...projectSchema.parse({
        externalId: "STORY-PAGES",
        name: "Pagination",
      }),
      stage: 0,
      completed: false,
    },
  });
  for (let i = 0; i < 57; i++) {
    const fileId = crypto.randomUUID();
    await db.insert(s.attachment).values({
      id: fileId,
      entityType: "boardRoomProject",
      entityId: id,
      filename: i % 2 ? "Repeated.txt" : "repeated.txt",
      contentType: "text/plain",
      size: 3,
      storagePath: `test/${fileId}`,
      createdAt: new Date("2020-01-01T00:00:00Z"),
      ownerEmail: admin.email,
      state: "ready",
    });
    if (i < 55)
      await db.execute(
        sql`UPDATE logical_document SET document_date=${i < 30 ? "2028-02-29" : "2030-01-01"}::date WHERE current_attachment_id=${fileId}`,
      );
  }
  const a = await projectStoryline(member, id, {});
  assert.equal(a.items.length, 50);
  assert.equal(a.datedCount, 55);
  assert.equal(a.undatedCount, 2);
  assert.ok(a.nextCursor);
  const b = await projectStoryline(member, id, { cursor: a.nextCursor });
  assert.equal(b.items.length, 5);
  assert.equal(b.nextCursor, null);
  assert.equal(
    new Set([...a.items, ...b.items].map((f) => f.documentId)).size,
    55,
  );
  const newest = await projectStoryline(member, id, { order: "newest" });
  assert.equal(newest.items[0].documentDate, "2030-01-01");
  assert.equal(a.items[0].documentDate, "2028-02-29");
  const undated = await projectStoryline(member, id, { group: "undated" });
  assert.equal(undated.items.length, 2);
  await assert.rejects(
    projectStoryline(member, project, { cursor: a.nextCursor }),
    /changed/i,
  );
  await db.execute(
    sql`UPDATE workspace_setting SET revision=revision+1 WHERE id='primary'`,
  );
  await assert.rejects(
    projectStoryline(member, id, { cursor: a.nextCursor }),
    /changed/i,
  );
  await assert.rejects(
    projectStoryline(member, id, { cursor: "invalid" }),
    /Invalid Storyline/,
  );
  await assert.rejects(
    projectStoryline(member, crypto.randomUUID(), {}),
    /not found/i,
  );
});

test("date writes reject archived/current-version violations and concurrent editors cannot overwrite each other", async () => {
  const { updateDocumentMetadata, projectStoryline } =
    await import("../src/lib/project-storyline");
  const { sql } = await import("drizzle-orm");
  const { db } = await database();
  const upload = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: project,
    filename: "metadata-race.txt",
    contentType: "text/plain",
    size: 3,
  });
  await writeLocalAttachment(admin, upload.id, Buffer.from("one"));
  const file = await finalizeAttachment(admin, upload.id);
  const results = await Promise.allSettled(
    ["2028-01-01", "2028-02-01"].map((documentDate) =>
      updateDocumentMetadata(admin, file.id, {
        documentDate,
        expectedDocumentVersion: file.documentVersion,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(
    updateDocumentMetadata({ ...member, isAdmin: true }, file.id, {
      documentDate: null,
      expectedDocumentVersion: file.documentVersion,
    }),
    /invalid|valid/i,
  );
  await assert.rejects(
    projectStoryline(
      { ...member, email: "not-invited@example.test" },
      project,
      {},
    ),
    /dicabut/i,
  );
  await db.execute(
    sql`INSERT INTO legacy_record(kind,id,data) VALUES('attachment',${file.id},'{}'::jsonb)`,
  );
  const current = (
    await listAttachments(admin, "boardRoomProject", project)
  ).find((f) => f.id === file.id)!;
  await assert.rejects(
    updateDocumentMetadata(admin, file.id, {
      documentDate: null,
      expectedDocumentVersion: current.documentVersion,
    }),
    /read-only/i,
  );
  assert.equal(
    (await projectStoryline(member, project, {})).items.some(
      (f) => f.id === file.id,
    ),
    false,
  );
});
