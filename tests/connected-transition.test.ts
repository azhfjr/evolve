import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "transition@example.test";
process.env.BLOB_READ_WRITE_TOKEN = "";
process.env.EVOLVE_LOCAL_FILES = "1";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true };
let dir: string;
const legacy = crypto.randomUUID(),
  oldTask = crypto.randomUUID(),
  board = crypto.randomUUID();
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-transition-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  process.env.EVOLVE_FILES_DIR = join(dir, "files");
  const { db } = await database();
  for (const n of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (q: string) => Promise<unknown> } }
    ).$client.exec(await readFile("migrations/" + n, "utf8"));
  await db.insert(s.member).values({ email: admin.email, name: admin.name });
  await db.insert(s.project).values({ id: legacy, name: "Historical project" });
  await db.insert(s.task).values({
    id: oldTask,
    title: "Historical task",
    projectId: legacy,
    createdBy: admin.email,
  });
  await db.insert(s.activity).values({
    id: crypto.randomUUID(),
    taskId: oldTask,
    projectId: legacy,
    actor: admin.email,
    message: "Historical review completed",
  });
  await db.insert(s.projectExpense).values({
    id: crypto.randomUUID(),
    projectId: legacy,
    currency: "IDR",
    amount: "1500",
    description: "Historical survey",
    category: "other",
    bookedOn: "2026-01-01",
    createdBy: admin.email,
  });
  const { reserveAttachment, writeLocalAttachment, finalizeAttachment } =
    await import("../src/lib/attachments");
  const evidence = Buffer.from("Recoverable local evidence");
  const file = await reserveAttachment(admin, {
    entityType: "task",
    entityId: oldTask,
    filename: "recovery.txt",
    contentType: "text/plain",
    size: evidence.length,
  });
  await writeLocalAttachment(admin, file.id, evidence);
  await finalizeAttachment(admin, file.id);
  const { projectSchema } = await import("../src/lib/board-room/model");
  await db.insert(s.boardRoomProject).values({
    id: board,
    externalId: "BOARD-A",
    data: {
      ...projectSchema.parse({
        externalId: "BOARD-A",
        name: "Canonical project",
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
test("transition archives work atomically, preserves old IDs and enforces canonical project tasks", async () => {
  const { transitionPreview, activateConnectedWorkspace, readLegacy } =
    await import("../src/lib/connected/transition");
  const preview = await transitionPreview(admin);
  assert.equal(preview.counts.task, 1);
  await activateConnectedWorkspace(admin, {
    token: preview.token,
    recoveryEvidence: "Disposable local rehearsal",
  });
  const { db } = await database();
  assert.equal((await db.select().from(s.task)).length, 0);
  assert.equal((await db.select().from(s.project))[0].id, board);
  assert.equal(
    (await readLegacy(admin, "task", oldTask)).record.title,
    "Historical task",
  );
  const historical = await readLegacy(admin, "project", legacy);
  assert.ok(
    historical.history.some(
      (h) => h.data.message === "Historical review completed",
    ),
  );
  assert.ok(
    historical.history.some((h) => h.data.description === "Historical survey"),
  );
  const { executeCommand } = await import("../src/lib/service");
  await assert.rejects(
    executeCommand(admin, {
      action: "createTask",
      task: { title: "No project" },
    }),
    /project/i,
  );
  const created = await executeCommand(admin, {
    action: "createTask",
    task: { title: "Canonical task", projectId: board },
  });
  assert.equal(created.task?.projectId, board);
  await assert.rejects(
    executeCommand(admin, {
      action: "createProject",
      name: "Duplicate",
      color: "green",
    }),
    /Board Room/i,
  );
  await assert.rejects(
    db.execute(
      sql`UPDATE legacy_record SET data='{}'::jsonb WHERE id=${oldTask}`,
    ),
    (e: unknown) =>
      String((e as { cause?: Error }).cause).includes("read-only"),
  );
});

test("local rollback restores legacy rows and private bytes while preserving new Board-linked tasks", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const restore = new PGlite();
  await restore.waitReady;
  const { db } = await database();
  try {
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await restore.exec(await readFile("migrations/" + name, "utf8"));
    await restore.query("INSERT INTO member(email,name) VALUES($1,$2)", [
      admin.email,
      admin.name,
    ]);
    // Rehearse rollback into a clean target: retain all post-cutover active identity/work first.
    for (const table of ["board_room_project", "project", "task"]) {
      const rows = await db.execute(
        sql`SELECT to_jsonb(t) AS data FROM ${sql.identifier(table)} t`,
      );
      for (const row of rows.rows)
        await restore.query(
          `INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,
          [JSON.stringify(row.data)],
        );
    }
    for (const kind of ["project", "task"]) {
      const rows = await db.execute(
        sql`SELECT data FROM legacy_record WHERE kind=${kind}`,
      );
      for (const row of rows.rows)
        await restore.query(
          `INSERT INTO ${kind} SELECT * FROM jsonb_populate_record(NULL::${kind},$1::jsonb)`,
          [JSON.stringify(row.data)],
        );
    }
    const files = await db.execute(
      sql`SELECT data FROM legacy_record WHERE kind='attachment'`,
    );
    assert.equal(files.rows.length, 1);
    for (const row of files.rows) {
      const f = row.data as Record<string, unknown>;
      const doc = (
        await db.execute(
          sql`SELECT * FROM logical_document WHERE id=${String(f.document_id)}`,
        )
      ).rows[0];
      await restore.query(
        "INSERT INTO logical_document SELECT * FROM jsonb_populate_record(NULL::logical_document,$1::jsonb)",
        [JSON.stringify(doc)],
      );
      await restore.query(
        "INSERT INTO attachment SELECT * FROM jsonb_populate_record(NULL::attachment,$1::jsonb)",
        [JSON.stringify(f)],
      );
      const target = join(dir, "restored-files", String(f.storage_path));
      await mkdir(target.substring(0, target.lastIndexOf("/")), {
        recursive: true,
      });
      await copyFile(join(dir, "files", String(f.storage_path)), target);
      assert.equal(
        (await readFile(target)).toString(),
        "Recoverable local evidence",
      );
    }
    const restored = await restore.query<{ id: string }>("SELECT id FROM task");
    assert.ok(restored.rows.some((r) => r.id === oldTask));
    const liveTasks = await db.select().from(s.task);
    assert.ok(liveTasks.length > 0);
    for (const t of liveTasks)
      assert.ok(restored.rows.some((r) => r.id === t.id));
    const targetProjects = await restore.query<{ id: string }>(
      "SELECT id FROM project",
    );
    assert.ok(targetProjects.rows.some((p) => p.id === legacy));
    assert.ok(targetProjects.rows.some((p) => p.id === board));
    const { removeAttachment } = await import("../src/lib/attachments");
    const fileId = String((files.rows[0].data as Record<string, unknown>).id);
    await assert.rejects(removeAttachment(admin, fileId), /read-only/i);
  } finally {
    await restore.close();
  }
});

test("archived draft evidence cannot poison unrelated quota cleanup", async () => {
  const {
    reserveAttachment,
    writeLocalAttachment,
    finalizeAttachment,
    cleanupAttachments,
  } = await import("../src/lib/attachments");
  const { db } = await database();
  const draft = await reserveAttachment(admin, {
    entityType: "taskDraft",
    entityId: crypto.randomUUID(),
    filename: "archived-draft.txt",
    contentType: "text/plain",
    size: 3,
  });
  await writeLocalAttachment(admin, draft.id, Buffer.from("old"));
  await finalizeAttachment(admin, draft.id);
  await db.execute(
    sql`UPDATE attachment SET created_at=now()-interval '2 days' WHERE id=${draft.id}`,
  );
  await db.execute(
    sql`INSERT INTO legacy_record(kind,id,data) SELECT 'attachment',id,to_jsonb(a) FROM attachment a WHERE id=${draft.id}`,
  );
  const pending = await reserveAttachment(admin, {
    entityType: "taskDraft",
    entityId: crypto.randomUUID(),
    filename: "abandoned.txt",
    contentType: "text/plain",
    size: 3,
  });
  await db.execute(
    sql`UPDATE attachment SET created_at=now()-interval '2 days' WHERE id=${pending.id}`,
  );
  await assert.doesNotReject(cleanupAttachments());
  assert.equal(
    (await db.select().from(s.attachment)).some((a) => a.id === pending.id),
    false,
  );
  assert.equal(
    (await db.select().from(s.attachment)).find((a) => a.id === draft.id)
      ?.state,
    "ready",
  );
});
