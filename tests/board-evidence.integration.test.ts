import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { boardImportHistory } from "../src/lib/board-room/import-history";
import { boardPortfolioReport } from "../src/lib/board-room/portfolio-report";
import {
  boardRoomCommand,
  boardRoomDetail,
} from "../src/lib/board-room/service";
import type { Actor } from "../src/lib/types";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "evidence-admin@example.com";
const admin: Actor = {
  email: "evidence-admin@example.com",
  name: "Evidence admin",
  isAdmin: true,
};
const member: Actor = {
  email: "evidence-member@example.com",
  name: "Evidence member",
  isAdmin: false,
};
let dir: string;
const ids = Array.from({ length: 57 }, () => crypto.randomUUID());
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-board-evidence-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  const { db } = await database();
  for (const file of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await (
      db as unknown as {
        $client: { exec: (source: string) => Promise<unknown> };
      }
    ).$client.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  await db.insert(s.member).values([
    { email: admin.email, name: admin.name },
    { email: member.email, name: member.name },
  ]);
  await db.insert(s.boardRoomProject).values(
    ids.map((id, i) => ({
      id,
      externalId: `EVID-${i}`,
      data: {
        externalId: `EVID-${i}`,
        name: `Evidence project ${i}`,
        category: i === 56 ? ("Transmisi" as const) : ("Pembangkit" as const),
        capacity: 10,
        unit: i === 1 ? "MWh" : "MW",
        codYear: 2028,
        startYear: 2026,
        stage: 3,
        completed: false,
        description: "",
        location: "",
        links: [],
        linkLabels: [],
        scope: "Build",
        voltage: "150 kV",
      },
    })),
  );
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});

test("meeting report includes every filtered page without mixing categories or capacity units", async () => {
  const report = await boardPortfolioReport(member, {
    category: "Pembangkit",
    year: "2028",
    stage: "3",
    page: 2,
  });
  assert.equal(report.rows.length, 56);
  assert.ok(report.rows.every((row) => row.category === "Pembangkit"));
  assert.equal(
    report.rows.find((row) => row.externalId === "EVID-1")?.unit,
    "MWh",
  );
  assert.equal(report.stages.length, 10);
  assert.equal(report.rows[0].valid, false);
  assert.equal(report.rows[0].progressReviewedAt, null);
  const empty = await boardPortfolioReport(member, { category: "Gardu Induk" });
  assert.equal(empty.rows.length, 0);
});

test("import journal groups batches and leaves legacy totals explicitly unknown", async () => {
  const { db } = await database();
  const batchId = crypto.randomUUID();
  await db.insert(s.boardRoomHistory).values([
    ...[0, 1].map((i) => ({
      id: crypto.randomUUID(),
      projectId: ids[i],
      actor: admin.email,
      kind: "csv_import",
      detail: {
        batchId,
        counts: { new: 2, updated: 0, unchanged: 3 },
        totalRows: 5,
        updateStages: false,
      },
    })),
    {
      id: crypto.randomUUID(),
      projectId: ids[2],
      actor: admin.email,
      kind: "csv_import",
      detail: { externalId: "EVID-2" },
    },
  ]);
  const result = await boardImportHistory(member);
  assert.equal(result.batches.length, 2);
  const batch = result.batches.find((entry) => entry.id === batchId)!;
  assert.deepEqual(batch.counts, { new: 2, updated: 0, unchanged: 3 });
  assert.equal(batch.totalRows, 5);
  assert.equal(batch.recordedProjects, 2);
  assert.equal(batch.updateStages, false);
  assert.equal(result.batches.find((entry) => entry.legacy)?.counts, null);
});

test("committed import records its batch totals including all-unchanged commits", async () => {
  const source = "RUPTL Code,Project name\nEVID-0,Evidence project 0";
  const preview = await boardRoomCommand(admin, {
    action: "importPreview",
    source,
  });
  assert.ok("token" in preview);
  await boardRoomCommand(admin, {
    action: "importCommit",
    source,
    token: preview.token,
  });
  const result = await boardImportHistory(admin);
  const batch = result.batches.find((entry) => entry.counts?.unchanged === 1);
  assert.ok(batch, "successful unchanged batches should remain visible");
  assert.equal(batch.totalRows, 1);
});

test("committed yearly CSV edit resets progress review through durable readback", async () => {
  const before = await boardRoomDetail(admin, ids[4]);
  await boardRoomCommand(admin, {
    action: "reviewProgress",
    id: ids[4],
    version: before.project.version,
    note: "Stage and yearly plan reviewed",
  });
  const reviewed = await boardRoomDetail(admin, ids[4]);
  assert.ok(reviewed.project.progressReviewedAt);
  const source = "RUPTL Code,Planned COD year\nEVID-4,2030";
  const preview = await boardRoomCommand(admin, {
    action: "importPreview",
    source,
  });
  assert.ok("token" in preview);
  await boardRoomCommand(admin, {
    action: "importCommit",
    source,
    token: preview.token,
  });
  const after = await boardRoomDetail(admin, ids[4]);
  assert.equal(after.project.codYear, 2030);
  assert.equal(after.project.stage, 3);
  assert.equal(after.project.progressReviewedAt, null);
  assert.equal(after.project.progressReviewedBy, null);
  assert.equal(after.project.progressReviewNote, "");
});

test("reports and import journals reject revoked membership", async () => {
  const { db } = await database();
  await db
    .update(s.member)
    .set({ disabled: true })
    .where(eq(s.member.email, member.email));
  await assert.rejects(boardPortfolioReport(member, {}), { status: 403 });
  await assert.rejects(boardImportHistory(member), { status: 403 });
});
