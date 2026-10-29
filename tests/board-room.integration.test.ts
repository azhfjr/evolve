import { eq } from "drizzle-orm";
import { loadWorkspaceHome } from "../src/lib/workspace-experience";
import { fileInventory, deleteManagedFiles } from "../src/lib/file-management";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import {
  boardRoomCommand,
  queryBoardRoom,
  boardRoomDetail,
  boardRoomExport,
} from "../src/lib/board-room/service";
import {
  reserveAttachment,
  writeLocalAttachment,
  finalizeAttachment,
  removeAttachment,
  readAttachment,
} from "../src/lib/attachments";
import type { Actor } from "../src/lib/types";
import type { BoardProject } from "../src/lib/board-room/model";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "board-admin@example.com";
process.env.EVOLVE_LOCAL_FILES = "1";
const admin: Actor = {
    email: "board-admin@example.com",
    name: "Board admin",
    isAdmin: true,
  },
  member: Actor = {
    email: "board-member@example.com",
    name: "Board member",
    isAdmin: false,
  };
let dir: string, p: BoardProject;
const values = {
  externalId: "KAL-001",
  name: "Kalimantan project",
  category: "Pembangkit",
  capacity: 100,
  unit: "MWp",
  startYear: 2026,
  codYear: 2028,
  description: "",
  location: "Kalimantan",
  links: [],
};
const command = (input: unknown) => boardRoomCommand(admin, input);
const projectResult = (
  result: Awaited<ReturnType<typeof boardRoomCommand>>,
) => {
  assert.ok("project" in result);
  return result.project as BoardProject;
};
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-board-test-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  process.env.EVOLVE_FILES_DIR = join(dir, "files");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const text = await readFile(`migrations/${name}`, "utf8");
    await (
      db as unknown as {
        $client: { exec: (source: string) => Promise<unknown> };
      }
    ).$client.exec(text);
  }
  await db.insert(s.member).values({ email: member.email, name: member.name });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("durable project CRUD rejects members and stale versions", async () => {
  await assert.rejects(
    boardRoomCommand(member, { action: "saveProject", values }),
    { status: 403 },
  );
  p = projectResult(await command({ action: "saveProject", values }));
  assert.equal(p.version, 1);
  assert.equal((await queryBoardRoom(member, {})).summary.total, 1);
  const updated = projectResult(
    await command({
      action: "progress",
      reason: "Synthetic regression workflow transition.",
      id: p.id,
      version: p.version,
      stage: 4,
    }),
  );
  await assert.rejects(
    command({
      action: "progress",
      reason: "Synthetic regression workflow transition.",
      id: p.id,
      version: p.version,
      stage: 2,
    }),
    { status: 409 },
  );
  p = updated;
  assert.equal((await boardRoomDetail(admin, p.id)).project.stage, 4);
});
test("custom-category commands are retired and primary categories remain supported", async () => {
  await assert.rejects(command({ action: "category", name: "Priority" }));
  await assert.rejects(
    command({ action: "deleteCategory", id: crypto.randomUUID(), version: 1 }),
  );
  assert.equal(
    (await queryBoardRoom(admin, {})).projects[0].category,
    "Pembangkit",
  );
});
test("CSV preview is atomic, stage-safe, idempotent and detects intervening edits", async () => {
  const source =
    "Project ID,Project name,Category,Current stage,Custom categories\nKAL-001,Updated,Pembangkit,1,Renewable\nKAL-002,Second,Transmisi,3,Priority\n";
  const preview = await command({ action: "importPreview", source });
  assert.ok("token" in preview);
  await command({ action: "importCommit", source, token: preview.token });
  const snap = await queryBoardRoom(admin, {});
  assert.equal(snap.summary.total, 2);
  p = snap.projects.find((x) => x.externalId === "KAL-001")!;
  assert.equal(p.stage, 4);
  const again = await command({ action: "importPreview", source });
  assert.ok("counts" in again);
  assert.equal(again.counts.unchanged, 2);
  assert.ok("token" in again);
  await command({ action: "importCommit", source, token: again.token });
  assert.equal((await queryBoardRoom(admin, {})).summary.total, 2);
  const stale = await command({ action: "importPreview", source });
  assert.ok("token" in stale);
  p = projectResult(
    await command({
      action: "progress",
      reason: "Synthetic regression workflow transition.",
      id: p.id,
      version: p.version,
      stage: 5,
    }),
  );
  await assert.rejects(
    command({ action: "importCommit", source, token: stale.token }),
    { status: 409 },
  );
  await assert.rejects(
    command({
      action: "importPreview",
      source:
        "Project ID,Project name,Category\nOK,Good,Pembangkit\nBAD,Bad,invalid",
    }),
  );
  assert.equal((await queryBoardRoom(admin, {})).summary.total, 2);
});
test("private files invalidate admin review; members cannot upload/remove/review", async () => {
  const bytes = new TextEncoder().encode("Project review document");
  await assert.rejects(
    reserveAttachment(member, {
      entityType: "boardRoomProject",
      entityId: p.id,
      filename: "review.txt",
      contentType: "text/plain",
      size: bytes.length,
    }),
    { status: 403 },
  );
  const upload = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: p.id,
    filename: "review.txt",
    contentType: "text/plain",
    size: bytes.length,
  });
  await writeLocalAttachment(admin, upload.id, bytes);
  await finalizeAttachment(admin, upload.id);
  p = (await boardRoomDetail(admin, p.id)).project;
  assert.equal(p.fileCount, 1);
  assert.equal(p.valid, false);
  p = projectResult(
    await command({
      action: "review",
      id: p.id,
      version: p.version,
      documentRevision: p.documentRevision,
      valid: true,
    }),
  );
  assert.equal(p.valid, true);
  assert.ok(await readAttachment(upload.id, member));
  await assert.rejects(removeAttachment(member, upload.id), { status: 403 });
  await assert.rejects(
    boardRoomCommand(member, {
      action: "review",
      id: p.id,
      version: p.version,
      documentRevision: p.documentRevision,
      valid: true,
    }),
    { status: 403 },
  );
  await removeAttachment(admin, upload.id);
  const latest = (await boardRoomDetail(admin, p.id)).project;
  assert.equal(latest.valid, false);
  assert.equal(latest.fileCount, 0);
  await assert.rejects(
    command({
      action: "review",
      id: p.id,
      version: p.version,
      documentRevision: p.documentRevision,
      valid: true,
    }),
    { status: 409 },
  );
  await assert.rejects(
    command({
      action: "review",
      id: p.id,
      version: latest.version,
      documentRevision: latest.documentRevision,
      valid: true,
    }),
  );
  p = latest;
});
test("bounded pages retain full-filter aggregates and zero-safe yearly category counts", async () => {
  const rows = Array.from(
    { length: 65 },
    (_, i) => `BATCH-${i},Project ${i},Gardu Induk,2030`,
  ).join("\n");
  const source = "Project ID,Project name,Category,Planned COD year\n" + rows;
  const preview = await command({ action: "importPreview", source });
  assert.ok("token" in preview);
  await command({ action: "importCommit", source, token: preview.token });
  const first = await queryBoardRoom(admin, { category: "Gardu Induk" });
  assert.equal(first.projects.length, 50);
  assert.equal(first.summary.total, 65);
  assert.equal(
    first.summary.years.find((y) => y.year === 2030)?.categories["Gardu Induk"],
    65,
  );
  const second = await queryBoardRoom(admin, {
    category: "Gardu Induk",
    page: 2,
  });
  assert.equal(second.projects.length, 15);
  assert.deepEqual(second.summary, first.summary);
  const focus = await queryBoardRoom(admin, { year: "2028" });
  assert.ok(focus.summary.years.find((y) => y.year === 2030));
});

test("CSV preview exposes exact stage changes and every page, with scope and voltage changes", async () => {
  const rows = Array.from(
    { length: 120 },
    (_, i) => `REVIEW-${i},Review ${i},Pembangkit,Line extension,150 kV`,
  ).join("\n");
  const source = "Project ID,Project name,Category,Scope,Voltage\n" + rows;
  const first = await command({ action: "importPreview", source });
  const second = await command({
    action: "importPreview",
    source,
    previewPage: 2,
  });
  assert.ok("rows" in first && "rows" in second);
  assert.equal(first.rows.length, 100);
  assert.equal(second.rows.length, 20);
  assert.equal(first.token, second.token);
  assert.ok(
    first.rows[0].fields.some(
      (f) => f.field === "Scope" && f.after === "Line extension",
    ),
  );
  assert.ok(
    first.rows[0].fields.some(
      (f) => f.field === "Voltage" && f.after === "150 kV",
    ),
  );
  const stage = await command({
    action: "importPreview",
    source: "Project ID,Current stage\nKAL-001,9",
    updateStages: true,
    reason: "Synthetic CSV workflow baseline.",
  });
  assert.ok("rows" in stage);
  assert.ok(
    stage.rows[0].fields.some(
      (f) => f.field === "Current stage" && f.after === "Stage 9",
    ),
  );
});

test("current-stage no-op preserves versions and full timeline ranges include start years", async () => {
  const before = (await boardRoomDetail(admin, p.id)).project;
  const noop = projectResult(
    await command({
      action: "progress",
      reason: "Synthetic regression workflow transition.",
      id: p.id,
      version: before.version,
      stage: before.stage,
      completed: before.completed,
    }),
  );
  assert.equal(noop.version, before.version);
  const range = projectResult(
    await command({
      action: "saveProject",
      values: {
        externalId: "RANGE-ONLY",
        name: "RANGEONLY project",
        startYear: 2026,
        codYear: 2040,
        links: ["https://example.com"],
        linkLabels: ["Charter"],
      },
    }),
  );
  assert.equal(range.category, "");
  const snapshot = await queryBoardRoom(admin, { search: "RANGEONLY" });
  assert.equal(snapshot.summary.rangeStart, 2026);
  assert.equal(snapshot.summary.rangeEnd, 2040);
  assert.equal(snapshot.summary.years[0].categories.Uncategorized, 1);
  assert.equal(snapshot.summary.total, 1);
});

test("shared workspace context follows saved preferences and rechecks revoked membership", async () => {
  const { db } = await database();
  const initial = await loadWorkspaceHome(admin);
  assert.equal(
    initial.totals.boardProjects,
    (await queryBoardRoom(admin, {})).summary.allTotal,
  );
  assert.equal(initial.profile.name, admin.name);
  await db
    .update(s.member)
    .set({
      preferences: {
        theme: "dark",
        density: "compact",
        reduceMotion: true,
        sidebarCollapsed: true,
      },
    })
    .where(eq(s.member.email, member.email));
  const home = await loadWorkspaceHome(member),
    board = await queryBoardRoom(member, {});
  assert.deepEqual(board.profile.preferences, home.profile.preferences);
  assert.deepEqual(board.settings, home.settings);
  assert.equal(board.theme, "dark");
  await db
    .update(s.member)
    .set({ disabled: true })
    .where(eq(s.member.email, member.email));
  await assert.rejects(loadWorkspaceHome(member), { status: 403 });
  await assert.rejects(queryBoardRoom(member, {}), { status: 403 });
  await db
    .update(s.member)
    .set({ disabled: false })
    .where(eq(s.member.email, member.email));
});

test("shared file inventory identifies Board Room files and removal invalidates review", async () => {
  const bytes = new TextEncoder().encode("Shared inventory review document");
  const upload = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: p.id,
    filename: "shared-inventory.txt",
    contentType: "text/plain",
    size: bytes.length,
  });
  await writeLocalAttachment(admin, upload.id, bytes);
  await finalizeAttachment(admin, upload.id);
  const latest = (await boardRoomDetail(admin, p.id)).project;
  await command({
    action: "review",
    id: p.id,
    version: latest.version,
    documentRevision: latest.documentRevision,
    valid: true,
  });
  const inventory = await fileInventory(admin, {
    room: "board",
    type: "boardRoomProject",
    state: "ready",
  });
  assert.equal(inventory.total, 1);
  assert.equal(inventory.items[0].context, `Board Room · ${latest.name}`);
  await assert.rejects(fileInventory(member, { type: "boardRoomProject" }), {
    status: 403,
  });
  await deleteManagedFiles(admin, { room: "board", ids: [upload.id] });
  const after = (await boardRoomDetail(admin, p.id)).project;
  assert.equal(after.valid, false);
  assert.equal(after.fileCount, 0);
});

test("canonical CSV imports and exports completion and link labels without bypassing document review", async () => {
  const { exportProjectCSV, parseProjectCSV } =
    await import("../src/lib/board-room/csv");
  const { projectSchema } = await import("../src/lib/board-room/model");
  const source = exportProjectCSV([
    {
      ...projectSchema.parse({
        externalId: "CSV-ROUNDTRIP",
        name: "CSV field parity",
        category: "Gardu Induk",
        location: "Kalimantan Utara",
        capacity: 42.5,
        unit: "MVA",
        startYear: 2027,
        codYear: 2032,
        links: ["https://example.com/a;b"],
        linkLabels: ["Signed; charter"],
      }),
      stage: 10,
      completed: true,
      scope: "New substation",
      voltage: "275/150 kV",
    },
  ]);
  const preview = await command({
    action: "importPreview",
    source,
    updateStages: true,
    reason: "Synthetic CSV workflow baseline.",
  });
  assert.ok("token" in preview);
  await command({
    action: "importCommit",
    source,
    updateStages: true,
    reason: "Synthetic CSV workflow baseline.",
    token: preview.token,
  });
  const snapshot = await queryBoardRoom(admin, { search: "CSV field parity" });
  assert.equal(snapshot.projects.length, 1);
  const actual = snapshot.projects[0];
  assert.equal(actual.completed, true);
  assert.equal(actual.valid, false);
  assert.equal(actual.fileCount, 0);
  assert.deepEqual(actual.linkLabels, ["Signed; charter"]);
  const exported = await boardRoomExport(admin, { search: "CSV field parity" });
  const patch = parseProjectCSV(exported)[0].patch;
  assert.equal(patch.completed, true);
  assert.deepEqual(patch.links, ["https://example.com/a;b"]);
  const preserve = "RUPTL Code,Current stage,Completed\nCSV-ROUNDTRIP,0,false";
  const untouched = await command({
    action: "importPreview",
    source: preserve,
    updateStages: false,
  });
  assert.ok("token" in untouched);
  assert.equal(untouched.counts.unchanged, 1);
  await assert.rejects(() =>
    command({
      action: "importPreview",
      source,
      mapping: { externalId: "RUPTL Code", valid: "Completed" },
    }),
  );
});

test("preview shows label-array changes even when joined labels look identical", async () => {
  const old = projectResult(
    await command({
      action: "saveProject",
      values: {
        externalId: "LABEL-PREVIEW",
        name: "Label preview",
        links: ["https://example.com/one", "https://example.com/two"],
        linkLabels: ["Charter; signed", "Study"],
      },
    }),
  );
  const source =
    'RUPTL Code,Project link labels\nLABEL-PREVIEW,"[""Charter"",""signed; Study""]"';
  const preview = await command({ action: "importPreview", source });
  assert.ok("rows" in preview);
  const change = preview.rows[0].fields.find(
    (f) => f.field === "Project link labels",
  );
  assert.ok(change);
  assert.notEqual(change.before, change.after);
  assert.equal(
    (await boardRoomDetail(admin, old.id)).project.linkLabels[0],
    "Charter; signed",
  );
});

test("room file inventories and bulk deletion cannot cross into the other app", async () => {
  const bytes = new TextEncoder().encode("Room isolation fixture");
  const boardFile = await reserveAttachment(admin, {
    entityType: "boardRoomProject",
    entityId: p.id,
    filename: "isolation-board.txt",
    contentType: "text/plain",
    size: bytes.length,
  });
  const lockerFile = await reserveAttachment(admin, {
    entityType: "taskDraft",
    entityId: crypto.randomUUID(),
    filename: "isolation-locker.txt",
    contentType: "text/plain",
    size: bytes.length,
  });
  for (const f of [boardFile, lockerFile]) {
    await writeLocalAttachment(admin, f.id, bytes);
    await finalizeAttachment(admin, f.id);
  }
  const board = await fileInventory(admin, { room: "board", q: "isolation-" });
  const locker = await fileInventory(admin, {
    room: "locker",
    q: "isolation-",
  });
  assert.deepEqual(
    board.items.map((f) => f.id),
    [boardFile.id],
  );
  assert.deepEqual(
    locker.items.map((f) => f.id),
    [lockerFile.id],
  );
  assert.equal(board.usage.bytes, locker.usage.bytes);
  assert.ok(board.usage.roomBytes! < board.usage.bytes);
  await assert.rejects(
    deleteManagedFiles(admin, {
      room: "board",
      ids: [boardFile.id, lockerFile.id],
    }),
    { status: 403 },
  );
  await assert.rejects(
    deleteManagedFiles(admin, { room: "locker", ids: [boardFile.id] }),
    { status: 403 },
  );
  assert.equal(
    (await fileInventory(admin, { room: "board", q: "isolation-" })).total,
    1,
  );
  assert.equal(
    (await fileInventory(admin, { room: "locker", q: "isolation-" })).total,
    1,
  );
  await deleteManagedFiles(admin, { room: "board", ids: [boardFile.id] });
  assert.equal(
    (await fileInventory(admin, { room: "locker", q: "isolation-" })).total,
    1,
  );
  await deleteManagedFiles(admin, { room: "locker", ids: [lockerFile.id] });
});

test("Board management and journal use Board records, filter, paginate and delete independently", async () => {
  const { boardManagementData, boardActivityReport, deleteBoardActivities } =
    await import("../src/lib/board-room/management");
  const { db } = await database();
  const lockerActivity = crypto.randomUUID();
  await db.insert(s.activity).values({
    id: lockerActivity,
    actor: admin.email,
    message: "Locker-only journal entry",
    kind: "project",
  });
  const data = await boardManagementData(member);
  assert.ok(data.projects.some((project) => project.id === p.id));
  assert.deepEqual(data.tasks, []);
  const report = await boardActivityReport(
    member,
    new URLSearchParams({ projectId: p.id, limit: "1" }),
  );
  assert.equal(report.activities.length, 1);
  assert.ok(report.total > 1);
  assert.ok(report.nextCursor);
  assert.ok(
    report.activities.every(
      (a) => a.projectId === p.id && a.id !== lockerActivity,
    ),
  );
  const next = await boardActivityReport(
    member,
    new URLSearchParams({
      projectId: p.id,
      limit: "1",
      cursor: report.nextCursor!,
    }),
  );
  assert.notEqual(next.activities[0].id, report.activities[0].id);
  await assert.rejects(
    boardActivityReport(
      member,
      new URLSearchParams({ q: "changed", cursor: report.nextCursor! }),
    ),
    { status: 400 },
  );
  assert.equal(
    (
      await boardActivityReport(
        member,
        new URLSearchParams({ kind: "project", q: "Created project:" }),
      )
    ).activities[0].kind,
    "project",
  );
  assert.equal(
    (await boardActivityReport(member, new URLSearchParams({ scope: "mine" })))
      .total,
    0,
  );
  await assert.rejects(
    boardActivityReport(
      member,
      new URLSearchParams({ from: "2028-01-01", to: "2027-01-01" }),
    ),
    { status: 400 },
  );
  await assert.rejects(
    deleteBoardActivities(member, { ids: [report.activities[0].id] }),
    { status: 403 },
  );
  await deleteBoardActivities(admin, {
    ids: [report.activities[0].id, lockerActivity],
  });
  assert.equal(
    (
      await db
        .select()
        .from(s.activity)
        .where(eq(s.activity.id, lockerActivity))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(s.boardRoomProject)
        .where(eq(s.boardRoomProject.id, p.id))
    ).length,
    1,
  );
});

test("legacy projects gain optional fields without data loss; historical Scope persists while active search uses Voltage", async () => {
  const { projectSchema } = await import("../src/lib/board-room/model");
  const { readCSV } = await import("../src/lib/board-room/csv");
  const { db } = await database();
  const id = crypto.randomUUID(),
    categoryId = crypto.randomUUID();
  const full = projectSchema.parse({
    ...values,
    externalId: "LEGACY-FIELDS",
    name: "Legacy fields project",
  });
  const { scope: oldScope, voltage: oldVoltage, ...legacy } = full;
  void oldScope;
  void oldVoltage;
  await db
    .insert(s.boardRoomCategory)
    .values({ id: categoryId, name: "Historical-only" });
  await db.insert(s.boardRoomProject).values({
    id,
    externalId: full.externalId,
    data: {
      ...legacy,
      categoryIds: [categoryId],
      stage: 3,
      completed: false,
    } as unknown as import("../src/lib/board-room/model").ProjectPayload,
  });
  await db
    .insert(s.boardRoomAssignment)
    .values({ id: crypto.randomUUID(), projectId: id, categoryId });
  const initial = (await boardRoomDetail(member, id)).project;
  assert.equal(initial.scope, "");
  assert.equal(initial.voltage, "");
  assert.equal(Object.hasOwn(initial, "categoryIds"), false);
  const unchanged = await command({
    action: "importPreview",
    source: "RUPTL Code,Project name\nLEGACY-FIELDS,Legacy fields project",
  });
  assert.ok("counts" in unchanged);
  assert.equal(unchanged.counts.unchanged, 1);
  const source =
    'RUPTL Code,Scope,Voltage\nLEGACY-FIELDS,"Extend bay; north",275/150 kV';
  const preview = await command({ action: "importPreview", source });
  assert.ok("rows" in preview);
  assert.ok(
    preview.rows[0].fields.some(
      (f) => f.field === "Scope" && f.after === "Extend bay; north",
    ),
  );
  assert.ok(
    preview.rows[0].fields.some(
      (f) => f.field === "Voltage" && f.after === "275/150 kV",
    ),
  );
  await command({ action: "importCommit", source, token: preview.token });
  const after = (await boardRoomDetail(member, id)).project;
  assert.equal(after.scope, "Extend bay; north");
  assert.equal(after.voltage, "275/150 kV");
  assert.equal(after.stage, 3);
  assert.equal(
    (await queryBoardRoom(member, { search: "Extend bay" })).summary.total,
    0,
  );
  assert.ok(
    (await queryBoardRoom(member, { search: "275/150" })).projects.some(
      (project) => project.id === id,
    ),
  );
  const blank = await command({
    action: "importPreview",
    source: "RUPTL Code,Scope,Voltage\nLEGACY-FIELDS,,",
  });
  assert.ok("counts" in blank);
  assert.equal(blank.counts.unchanged, 1);
  const csv = readCSV(
    await boardRoomExport(member, { search: "LEGACY-FIELDS" }),
  );
  assert.equal(csv[1][csv[0].indexOf("Scope")], after.scope);
  assert.equal(csv[1][csv[0].indexOf("Voltage")], after.voltage);
  assert.equal(csv[0].includes("Custom categories"), false);
  assert.equal(
    (
      await db
        .select()
        .from(s.boardRoomAssignment)
        .where(eq(s.boardRoomAssignment.projectId, id))
    ).length,
    1,
  );
  await assert.rejects(
    command({
      action: "importPreview",
      source,
      mapping: { customCategoryNames: "Scope" },
    }),
  );
});

test("shared usage buckets reconcile all states independently of inventory filters", async () => {
  const { db } = await database();
  const before = (await fileInventory(admin, {})).usage;
  const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
  const fixtures = [
    ["project", "ready", 101],
    ["task", "pending", 202],
    ["taskDraft", "deleting", 303],
    ["boardRoomProject", "pending", 404],
    ["avatar", "ready", 505],
    ["workspace", "deleting", 606],
  ] as const;
  try {
    await db.insert(s.attachment).values(
      fixtures.map(([entityType, state, size], i) => ({
        id: ids[i],
        entityType,
        state,
        size,
        entityId:
          entityType === "boardRoomProject" ? p.id : crypto.randomUUID(),
        ownerEmail: admin.email,
        filename: "usage-fixture.txt",
        contentType: "text/plain",
        storagePath: `usage/${ids[i]}`,
      })),
    );
    const a = await fileInventory(admin, {
      room: "board",
      q: "does-not-exist",
      state: "ready",
      page: 2,
    });
    const b = await fileInventory(admin, { room: "locker" });
    assert.equal(a.total, 0);
    assert.deepEqual(a.usage.breakdown, b.usage.breakdown);
    assert.ok(
      a.usage.breakdown,
      "both app usages and shared assets are returned",
    );
    const buckets = Object.values(a.usage.breakdown);
    assert.equal(
      buckets.reduce((n, x) => n + x.bytes, 0),
      a.usage.bytes,
    );
    assert.equal(
      buckets.reduce((n, x) => n + x.count, 0),
      a.usage.count,
    );
    assert.equal(
      a.usage.breakdown.locker.bytes - before.breakdown.locker.bytes,
      606,
    );
    assert.equal(
      a.usage.breakdown.board.bytes - before.breakdown.board.bytes,
      404,
    );
    assert.equal(
      a.usage.breakdown.sharedAssets.bytes -
        before.breakdown.sharedAssets.bytes,
      1111,
    );
    assert.equal(a.usage.bytes - before.bytes, 2121);
  } finally {
    for (const id of ids)
      await db.delete(s.attachment).where(eq(s.attachment.id, id));
  }
});

test("concurrent reservations in both rooms share one quota", async () => {
  const { db } = await database();
  const current = (await fileInventory(admin, {})).usage;
  const filler = crypto.randomUUID();
  const ids = [filler];
  try {
    let remaining = current.limit - current.bytes - 1000;
    while (remaining > 0) {
      const id = crypto.randomUUID();
      ids.push(id);
      const size = Math.min(25 * 1024 * 1024, remaining);
      remaining -= size;
      await db.insert(s.attachment).values({
        id,
        entityType: "taskDraft",
        entityId: crypto.randomUUID(),
        state: "pending",
        size,
        ownerEmail: admin.email,
        filename: "quota-fixture.txt",
        contentType: "text/plain",
        storagePath: `quota/${id}`,
        createdAt: new Date(Date.now() - 120000),
      });
    }
    const results = await Promise.allSettled([
      reserveAttachment(admin, {
        entityType: "taskDraft",
        entityId: crypto.randomUUID(),
        filename: "locker-quota.txt",
        contentType: "text/plain",
        size: 600,
      }),
      reserveAttachment(admin, {
        entityType: "boardRoomProject",
        entityId: p.id,
        filename: "board-quota.txt",
        contentType: "text/plain",
        size: 600,
      }),
    ]);
    for (const result of results)
      if (result.status === "fulfilled") ids.push(result.value.id);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assert.equal(rejected.reason.status, 409);
    assert.ok((await fileInventory(admin, {})).usage.bytes <= current.limit);
  } finally {
    for (const id of ids)
      await db.delete(s.attachment).where(eq(s.attachment.id, id));
  }
});
