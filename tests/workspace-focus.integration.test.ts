import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { loadWorkspaceHome } from "../src/lib/workspace-experience";
import { projectSchema } from "../src/lib/board-room/model";
import { focusDate } from "../src/lib/workspace-focus";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "focus-admin@example.com";
const actor = {
  email: "focus-admin@example.com",
  name: "Focus admin",
  isAdmin: true,
};
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-focus-test-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec(source: string): Promise<unknown> } }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  await db
    .insert(s.member)
    .values({ email: actor.email, name: actor.name, timeZone: "Asia/Jakarta" });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("Home focus counts exclude done and archived tasks and use ready Board documents", async () => {
  const { db } = await database();
  const today = focusDate("Asia/Jakarta");
  const rows = [
    {
      title: "My overdue",
      status: "todo" as const,
      dueDate: "2000-01-01",
      assignee: actor.email,
    },
    {
      title: "Other overdue",
      status: "in_progress" as const,
      dueDate: "2000-01-01",
      assignee: null,
    },
    {
      title: "Done overdue",
      status: "done" as const,
      dueDate: "2000-01-01",
      assignee: actor.email,
    },
    {
      title: "Archived",
      status: "todo" as const,
      dueDate: "2000-01-01",
      assignee: actor.email,
      archived: true,
    },
    {
      title: "Today",
      status: "todo" as const,
      dueDate: today,
      assignee: actor.email,
    },
  ];
  for (const row of rows)
    await db
      .insert(s.task)
      .values({ id: crypto.randomUUID(), createdBy: actor.email, ...row });
  const boardId = crypto.randomUUID();
  await db.insert(s.boardRoomProject).values({
    id: boardId,
    externalId: "FOCUS-1",
    data: {
      ...projectSchema.parse({
        externalId: "FOCUS-1",
        name: "Needs metadata",
      }),
      stage: 0,
      completed: false,
    },
  });
  const data = await loadWorkspaceHome(actor);
  assert.equal(data.focus?.myOpen, 2);
  assert.equal(data.focus?.overdue, 2);
  assert.equal(data.focus?.dueToday, 1);
  assert.equal(data.focus?.noFiles, 1);
  assert.equal(data.focus?.needsReview, 0);
  assert.equal(data.focus?.incomplete, 1);
  assert.equal(data.focus?.today, today);
  const fileId = crypto.randomUUID();
  await db.insert(s.attachment).values({
    id: fileId,
    entityType: "boardRoomProject",
    entityId: boardId,
    ownerEmail: actor.email,
    filename: "Evidence.txt",
    contentType: "text/plain",
    size: 1,
    storagePath: `focus/${fileId}`,
    state: "pending",
  });
  assert.equal((await loadWorkspaceHome(actor)).focus?.noFiles, 1);
  await db
    .update(s.attachment)
    .set({ state: "ready" })
    .where(eq(s.attachment.id, fileId));
  const pendingReview = await loadWorkspaceHome(actor);
  assert.equal(pendingReview.focus?.noFiles, 0);
  assert.equal(pendingReview.focus?.needsReview, 1);
  const [project] = await db
    .select()
    .from(s.boardRoomProject)
    .where(eq(s.boardRoomProject.id, boardId));
  await db
    .update(s.boardRoomProject)
    .set({ reviewedRevision: project.documentRevision })
    .where(eq(s.boardRoomProject.id, boardId));
  assert.equal((await loadWorkspaceHome(actor)).focus?.needsReview, 0);
  const member = {
    email: "focus-member@example.com",
    name: "Focus member",
    isAdmin: false,
  };
  await db.insert(s.member).values({ email: member.email, name: member.name });
  assert.equal((await loadWorkspaceHome(member)).focus?.myOpen, 0);
  await db
    .update(s.member)
    .set({ disabled: true })
    .where(eq(s.member.email, member.email));
  await assert.rejects(loadWorkspaceHome(member), { status: 403 });
});
