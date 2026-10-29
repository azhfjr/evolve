import { eq, sql } from "drizzle-orm";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { projectSchema } from "../src/lib/board-room/model";
import { reserveAttachment } from "../src/lib/attachments";
process.env.DATABASE_URL = "";
process.env.BLOB_READ_WRITE_TOKEN = "";
process.env.EVOLVE_LOCAL_FILES = "1";
process.env.ADMIN_EMAIL = "documents-admin@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true };
const member = {
  email: "documents-member@example.test",
  name: "Member",
  isAdmin: false,
};
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-documents-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (q: string) => Promise<unknown> } }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  await db
    .insert(s.member)
    .values([admin, member].map((a) => ({ email: a.email, name: a.name })));
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("document purpose is accepted on reservations, legacy uploads remain unlabelled", async () => {
  const labelled = await reserveAttachment(member, {
    entityType: "taskDraft",
    entityId: crypto.randomUUID(),
    filename: "notes.txt",
    contentType: "text/plain",
    size: 3,
    purpose: "Meeting Notes",
  });
  const { db } = await database();
  const rows = await db.select().from(s.attachment);
  assert.equal(
    rows.find((f) => f.id === labelled.id)?.purpose,
    "Meeting Notes",
  );
  await reserveAttachment(member, {
    entityType: "taskDraft",
    entityId: crypto.randomUUID(),
    filename: "old.txt",
    contentType: "text/plain",
    size: 3,
  });
  assert.equal(
    (await db.select().from(s.attachment)).find((f) => f.filename === "old.txt")
      ?.purpose,
    null,
  );
  await assert.rejects(
    reserveAttachment(member, {
      entityType: "taskDraft",
      entityId: crypto.randomUUID(),
      filename: "bad.txt",
      contentType: "text/plain",
      size: 3,
      purpose: "Unrecognised",
    }),
  );
});

test("labels enforce owner/admin access, stale writes and do not change Board review", async () => {
  const { labelDocument } = await import("../src/lib/document-service");
  const { db } = await database();
  const projectId = crypto.randomUUID();
  await db.insert(s.boardRoomProject).values({
    id: projectId,
    externalId: projectId,
    data: {
      stage: 1,
      completed: false,
      ...projectSchema.parse({
        externalId: projectId,
        name: "Review fixture",
      }),
    },
    reviewedRevision: 0,
  });
  const id = crypto.randomUUID();
  await db.insert(s.attachment).values({
    id,
    entityType: "boardRoomProject",
    entityId: projectId,
    ownerEmail: admin.email,
    filename: "label.txt",
    contentType: "text/plain",
    size: 3,
    storagePath: `test/${id}`,
    state: "ready",
  });
  await db
    .update(s.boardRoomProject)
    .set({
      reviewedRevision: sql`${s.boardRoomProject.documentRevision}`,
      reviewedBy: admin.email,
      reviewedAt: new Date(),
    })
    .where(eq(s.boardRoomProject.id, projectId));
  const [prior] = await db.select().from(s.boardRoomProject);
  assert.equal(prior.reviewedRevision, prior.documentRevision);
  assert.ok(prior.reviewedBy);
  await assert.rejects(
    labelDocument(member, id, { purpose: "KKP", expectedPurpose: null }),
    { status: 403 },
  );
  assert.equal(
    (await labelDocument(admin, id, { purpose: "KKP", expectedPurpose: null }))
      .purpose,
    "KKP",
  );
  await assert.rejects(
    labelDocument(admin, id, { purpose: "KKO", expectedPurpose: null }),
    { status: 409 },
  );
  const [next] = await db.select().from(s.boardRoomProject);
  assert.equal(next.documentRevision, prior.documentRevision);
  assert.equal(next.reviewedRevision, prior.reviewedRevision);
  const draft = (await db.select().from(s.attachment)).find(
    (f) => f.entityType === "taskDraft",
  )!;
  await db
    .update(s.attachment)
    .set({ state: "ready" })
    .where((await import("drizzle-orm")).eq(s.attachment.id, draft.id));
  await assert.rejects(
    labelDocument(admin, draft.id, {
      purpose: "Reference",
      expectedPurpose: draft.purpose as null,
    }),
    { status: 403 },
  );
});
test("project manifest includes Locker tasks, excludes drafts/images and enforces selection scope", async () => {
  const { documentManifest } = await import("../src/lib/document-service");
  const { db } = await database();
  const pid = crypto.randomUUID(),
    tid = crypto.randomUUID();
  await db.insert(s.project).values({ id: pid, name: "../Planning" });
  await db.insert(s.task).values({
    id: tid,
    title: "Task / calculations",
    projectId: pid,
    createdBy: member.email,
  });
  const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
  await db.insert(s.attachment).values(
    ids.map((id, i) => ({
      id,
      entityType: i === 1 ? "task" : i === 3 ? "avatar" : "project",
      entityId: i === 1 ? tid : pid,
      ownerEmail: member.email,
      filename: "same.txt",
      contentType: "text/plain",
      size: 3,
      storagePath: `test/${id}`,
      state: i === 2 ? "pending" : "ready",
    })),
  );
  const manifest = await documentManifest(member, {
    kind: "project",
    room: "locker",
    id: pid,
  });
  assert.equal(manifest.files.length, 2);
  assert.equal(manifest.excluded, 1);
  assert.equal(manifest.bytes, 6);
  assert.ok(manifest.files.some((f) => f.taskName));
  assert.ok(manifest.files.every((f) => !f.path.includes("/../")));
  await assert.rejects(documentManifest(member, { kind: "workspace" }), {
    status: 403,
  });
  const workspace = await documentManifest(admin, { kind: "workspace" });
  assert.ok(workspace.files.some((f) => f.room === "board"));
  assert.ok(workspace.files.some((f) => f.room === "locker"));
  assert.ok(!workspace.files.some((f) => f.id === ids[3]));
  await assert.rejects(
    documentManifest(admin, {
      kind: "selection",
      room: "board",
      ids: [ids[0]],
    }),
    { status: 403 },
  );
  await assert.rejects(
    documentManifest(admin, { kind: "selection", ids: [ids[3]] }),
    { status: 403 },
  );
});
test("ZIP parts bound memory, safe paths distinguish duplicates and index neutralizes formulas", async () => {
  const { archiveParts, archiveFilePath, documentIndex } =
    await import("../src/lib/document-model");
  const file = {
    id: crypto.randomUUID(),
    filename: "../../same.txt",
    size: 25 * 1024 * 1024,
    purpose: null,
    ownerEmail: "=IMPORT()",
    createdAt: "2026-10-26",
    room: "locker" as const,
    projectId: crypto.randomUUID(),
    projectName: "../Unsafe",
    taskName: null,
  };
  const files = Array.from({ length: 9 }, () => {
    const f = { ...file, id: crypto.randomUUID() };
    return { ...f, path: archiveFilePath(f) };
  });
  const parts = archiveParts(files);
  assert.deepEqual(
    parts.map((p) => p.length),
    [4, 4, 1],
  );
  assert.equal(new Set(files.map((f) => f.path)).size, 9);
  assert.ok(!files[0].path.includes("/../"));
  assert.match(documentIndex(files), /'=IMPORT/);
});

test("browser ZIP output contains exact documents and labelled CSV without persisting an archive", async () => {
  const { buildDocumentArchive } =
    await import("../src/lib/document-archive-client");
  const { unzipSync, strFromU8 } = await import("fflate");
  const { archiveFilePath } = await import("../src/lib/document-model");
  const source = new TextEncoder().encode("Exact project evidence");
  const base = {
    id: crypto.randomUUID(),
    filename: "evidence.txt",
    size: source.length,
    purpose: "KKP" as const,
    ownerEmail: member.email,
    createdAt: new Date().toISOString(),
    room: "locker" as const,
    projectId: crypto.randomUUID(),
    projectName: "ZIP project",
    taskName: null,
  };
  const file = { ...base, path: archiveFilePath(base) };
  const oldFetch = globalThis.fetch;
  const readings: number[] = [];
  try {
    globalThis.fetch = async () => new Response(source, { status: 200 });
    const blob = await buildDocumentArchive(
      [file],
      (loaded) => readings.push(loaded),
      new AbortController().signal,
    );
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(strFromU8(archive[file.path]), "Exact project evidence");
    assert.match(strFromU8(archive["document-index.csv"]), /KKP/);
    assert.equal(readings.at(-1), source.length);
    globalThis.fetch = async () =>
      new Response(source.slice(0, 2), { status: 200 });
    await assert.rejects(
      buildDocumentArchive([file], () => {}, new AbortController().signal),
      /interrupted/,
    );
    globalThis.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(
      buildDocumentArchive([file], () => {}, new AbortController().signal),
      /unavailable/,
    );
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      buildDocumentArchive([file], () => {}, abort.signal),
      { name: "AbortError" },
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("Unlabelled purpose filter shows documents rather than profile or workspace images", async () => {
  const { fileInventory } = await import("../src/lib/file-management");
  const all = await fileInventory(admin, { room: "all", purpose: "all" });
  assert.ok(all.items.some((f) => f.entityType === "avatar"));
  const unlabelled = await fileInventory(admin, {
    room: "all",
    purpose: "unlabelled",
  });
  assert.ok(unlabelled.items.length);
  assert.ok(
    unlabelled.items.every(
      (f) => !["avatar", "workspace"].includes(f.entityType),
    ),
  );
});

test("canonical Locker project archives include shared Board evidence and its task attachments without crossing scopes", async () => {
  const { documentManifest } = await import("../src/lib/document-service");
  const { db } = await database();
  await db.execute(
    sql`UPDATE connected_workspace SET enabled=true WHERE id='primary'`,
  );
  const projects = [crypto.randomUUID(), crypto.randomUUID()],
    tasks = [crypto.randomUUID(), crypto.randomUUID()],
    files = Array.from({ length: 4 }, () => crypto.randomUUID());
  for (let i = 0; i < 2; i++) {
    await db.insert(s.boardRoomProject).values({
      id: projects[i],
      externalId: "ARCHIVE-" + i,
      data: {
        ...projectSchema.parse({
          externalId: "ARCHIVE-" + i,
          name: "Archive project " + i,
        }),
        stage: 0,
        completed: false,
      },
    });
    await db.insert(s.task).values({
      id: tasks[i],
      title: "Project task " + i,
      projectId: projects[i],
      createdBy: member.email,
    });
    await db.insert(s.attachment).values([
      {
        id: files[i * 2],
        entityType: "boardRoomProject",
        entityId: projects[i],
        filename: "Project.txt",
        ownerEmail: admin.email,
        contentType: "text/plain",
        size: 3,
        storagePath: "test/" + files[i * 2],
        state: "ready",
      },
      {
        id: files[i * 2 + 1],
        entityType: "task",
        entityId: tasks[i],
        filename: "Task.txt",
        ownerEmail: member.email,
        contentType: "text/plain",
        size: 3,
        storagePath: "test/" + files[i * 2 + 1],
        state: "ready",
      },
    ]);
  }
  const locker = await documentManifest(member, {
    kind: "project",
    room: "locker",
    id: projects[0],
  });
  assert.deepEqual(
    new Set(locker.files.map((f) => f.id)),
    new Set(files.slice(0, 2)),
  );
  const board = await documentManifest(member, {
    kind: "project",
    room: "board",
    id: projects[0],
  });
  assert.deepEqual(
    board.files.map((f) => f.id),
    [files[0]],
  );
  const workspace = await documentManifest(admin, {
    kind: "workspace",
    room: "locker",
  });
  assert.ok(workspace.files.some((f) => f.id === files[1]));
  assert.ok(!workspace.files.some((f) => f.id === files[0]));
  const { projectStoryline } = await import("../src/lib/project-storyline");
  const story = await projectStoryline(member, projects[0], {
    group: "undated",
  });
  assert.deepEqual(
    story.items.map((f) => f.id),
    [files[0]],
  );
});
