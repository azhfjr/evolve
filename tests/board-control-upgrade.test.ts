import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import {
  boardRoomCommand,
  boardRoomDetail,
  queryBoardRoom,
} from "../src/lib/board-room/service";
import {
  normalizeProjectPayload,
  projectSchema,
  type BoardProject,
  type ProjectPayload,
} from "../src/lib/board-room/model";
import { projectHealth, stageNeedsReason } from "../src/lib/board-room/health";
import type { Actor } from "../src/lib/types";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "control-admin@example.com";
const admin: Actor = {
  email: "control-admin@example.com",
  name: "Admin",
  isAdmin: true,
};
const member: Actor = {
  email: "control-member@example.com",
  name: "Member",
  isAdmin: false,
};
let dir: string;
const base = {
  externalId: "CONTROL-1",
  name: "Control project",
  category: "Pembangkit",
  capacity: 20,
  unit: "MW",
  startYear: 2026,
  codYear: 2028,
  scope: "Generation",
  voltage: "150 kV",
  location: "Kalimantan Timur",
};
const project = (result: Awaited<ReturnType<typeof boardRoomCommand>>) => {
  assert.ok("project" in result);
  return result.project as BoardProject;
};
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-board-control-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
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
  await db.insert(s.member).values({ email: member.email, name: member.name });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("historical Board JSON receives empty review metadata without borrowing updatedAt", () => {
  const old = normalizeProjectPayload({
    ...projectSchema.parse(base),
    stage: 0,
    completed: false,
  } as ProjectPayload);
  assert.equal(old.progressReviewedAt, null);
  assert.deepEqual(old.documentChecklist, []);
  assert.equal(old.responsible, "");
});
test("progress review is durable, admin-only and isolated from generic metadata saves", async () => {
  let p = project(
    await boardRoomCommand(admin, { action: "saveProject", values: base }),
  );
  assert.equal(
    (await queryBoardRoom(admin, { attention: "unassigned" })).summary.total,
    1,
  );
  assert.equal(
    (await queryBoardRoom(admin, { attention: "stale" })).summary.total,
    1,
  );
  await assert.rejects(
    boardRoomCommand(member, {
      action: "reviewProgress",
      id: p.id,
      version: p.version,
      note: "Reviewed",
    }),
    { status: 403 },
  );
  const priorVersion = p.version;
  p = project(
    await boardRoomCommand(admin, {
      action: "reviewProgress",
      id: p.id,
      version: p.version,
      note: "COD and stage confirmed with team.",
    }),
  );
  assert.equal(p.progressReviewedBy, admin.email);
  assert.ok(p.progressReviewedAt);
  assert.equal(p.progressReviewNote, "COD and stage confirmed with team.");
  assert.equal(
    (await queryBoardRoom(admin, { attention: "stale" })).summary.total,
    0,
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "reviewProgress",
      id: p.id,
      version: priorVersion,
      note: "Old view",
    }),
    { status: 409 },
  );
  const reviewedAt = p.progressReviewedAt;
  p = project(
    await boardRoomCommand(admin, {
      action: "saveProject",
      id: p.id,
      version: p.version,
      values: { ...base, responsible: "Planning team" },
    }),
  );
  assert.equal(p.progressReviewedAt, reviewedAt);
  assert.equal(
    (await queryBoardRoom(admin, { attention: "unassigned" })).summary.total,
    0,
  );
  p = project(
    await boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 1,
    }),
  );
  assert.equal(p.progressReviewedAt, null);
  assert.equal(
    (await queryBoardRoom(admin, { attention: "stale" })).summary.total,
    1,
  );
});
test("document requirements persist, enforce review completeness and reject stale checklist edits", async () => {
  let p = project(
    await boardRoomCommand(admin, {
      action: "saveProject",
      values: {
        ...base,
        externalId: "CONTROL-DOC",
        documentChecklist: [{ label: "Approved study", checked: false }],
      },
    }),
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "review",
      id: p.id,
      version: p.version,
      documentRevision: p.documentRevision,
      valid: true,
      note: "reviewed",
    }),
    /required document|Upload at least/i,
  );
  const old = p.version;
  p = project(
    await boardRoomCommand(admin, {
      action: "checkDocument",
      id: p.id,
      version: p.version,
      index: 0,
      checked: true,
    }),
  );
  assert.equal(p.documentChecklist?.[0].checked, true);
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "checkDocument",
      id: p.id,
      version: old,
      index: 0,
      checked: false,
    }),
    { status: 409 },
  );
  assert.equal(
    (await boardRoomDetail(admin, p.id)).project.documentChecklist?.[0].label,
    "Approved study",
  );
});
test("supplied stage jump reasons are validated and kept in project history", async () => {
  let p = project(
    await boardRoomCommand(admin, {
      action: "saveProject",
      values: { ...base, externalId: "CONTROL-STAGE" },
    }),
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 5,
      reason: " ",
    }),
    /reason/i,
  );
  p = project(
    await boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 5,
      reason: "Imported baseline confirmed.",
    }),
  );
  const detail = await boardRoomDetail(admin, p.id);
  assert.ok(
    detail.history.some(
      (h) =>
        h.kind === "progress" &&
        (h.detail as { reason?: string }).reason ===
          "Imported baseline confirmed.",
    ),
  );
});

test("attention health uses dedicated review age and separates responsibility from missing planning data", () => {
  const complete = {
    ...projectSchema.parse(base),
    stage: 5,
    completed: false,
    responsible: "Team",
    progressReviewedAt: "2026-10-01T00:00:00.000Z",
  };
  assert.deepEqual(
    projectHealth(complete, Date.parse("2026-10-15T00:00:00Z")),
    { missing: [], unassigned: false, stale: false },
  );
  assert.equal(
    projectHealth(complete, Date.parse("2026-11-01T00:00:00Z")).stale,
    true,
  );
  assert.equal(
    projectHealth(
      { ...complete, completed: true },
      Date.parse("2026-11-01T00:00:00Z"),
    ).stale,
    false,
  );
  assert.ok(
    !projectHealth({ ...complete, scope: "", codYear: null }).missing.includes(
      "scope",
    ),
  );
  assert.equal(stageNeedsReason(5, 4), true);
  assert.equal(stageNeedsReason(0, 5), true);
  assert.equal(stageNeedsReason(5, 6), false);
});

test("all admin clients must explain stage jumps, reversals and reopening completion", async () => {
  let p = project(
    await boardRoomCommand(admin, {
      action: "saveProject",
      values: { ...base, externalId: "STRICT-REASON" },
    }),
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 5,
    }),
    /reason/i,
  );
  p = project(
    await boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 5,
      reason: "Reviewed baseline.",
    }),
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 4,
    }),
    /reason/i,
  );
  p = project(
    await boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 10,
      reason: "Final stage confirmed.",
    }),
  );
  p = project(
    await boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 10,
      completed: true,
    }),
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "progress",
      id: p.id,
      version: p.version,
      stage: 10,
      completed: false,
    }),
    /reason/i,
  );
});

test("CSV workflow overrides cannot bypass reasons for exceptional stage changes", async () => {
  await boardRoomCommand(admin, {
    action: "saveProject",
    values: { ...base, externalId: "STRICT-CSV" },
  });
  const source = "RUPTL Code,Current stage\nSTRICT-CSV,5";
  const preview = await boardRoomCommand(admin, {
    action: "importPreview",
    source,
    updateStages: true,
  });
  assert.ok("token" in preview);
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "importCommit",
      source,
      updateStages: true,
      token: preview.token,
    }),
    /reason/i,
  );
  const explained = await boardRoomCommand(admin, {
    action: "importPreview",
    source,
    updateStages: true,
    reason: "Approved imported stage baseline.",
  });
  assert.ok("token" in explained);
  await boardRoomCommand(admin, {
    action: "importCommit",
    source,
    updateStages: true,
    reason: "Approved imported stage baseline.",
    token: explained.token,
  });
  const result = await queryBoardRoom(admin, { search: "STRICT-CSV" });
  assert.equal(result.projects[0].stage, 5);
  const detail = await boardRoomDetail(admin, result.projects[0].id);
  assert.ok(
    detail.history.some(
      (h) =>
        h.kind === "csv_import" &&
        (h.detail as { reason?: string }).reason ===
          "Approved imported stage baseline.",
    ),
  );
});
