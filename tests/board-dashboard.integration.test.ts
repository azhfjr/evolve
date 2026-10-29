import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import { queryBoardRoom } from "../src/lib/board-room/service";
import { querySchema } from "../src/lib/board-room/model";
import { boardViewFiltersSchema } from "../src/lib/board-room/saved-views-model";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "dashboard@example.com";
const actor = {
  email: "dashboard@example.com",
  name: "Dashboard",
  isAdmin: true,
};
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-dashboard-"));
  process.env.EVOLVE_DATA_DIR = dir;
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (s: string) => Promise<unknown> } }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  await db.execute(
    sql`INSERT INTO board_room_project(id,external_id,data) SELECT gen_random_uuid(),'DASH-'||n,jsonb_build_object('name','Project '||n,'externalId','DASH-'||n,'category','Pembangkit','stage',0,'completed',false,'codYear',CASE WHEN n=61 THEN NULL ELSE 2026+n%2 END,'location',CASE WHEN n=61 THEN '' ELSE 'Kalimantan' END,'capacity',CASE WHEN n=61 THEN NULL WHEN n=1 THEN 0 ELSE 10 END,'unit',CASE WHEN n=1 THEN 'MWp' WHEN n=2 THEN 'custom' ELSE 'MW' END) FROM generate_series(1,61) n`,
  );
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("dashboard_totals_ignore_page", async () => {
  for (const page of [1, 999]) {
    const data = await queryBoardRoom(actor, { page });
    assert.ok(data.analytics, "complete analytics must be supplied");
    assert.equal(data.summary.total, 61);
    assert.equal(
      data.analytics.coverage.linked + data.analytics.coverage.unlinked,
      61,
    );
    assert.equal(
      data.analytics.evidence.reduce(
        (s, r) => s + r.valid + r.review + r.none,
        0,
      ),
      61,
    );
    assert.equal(
      data.analytics.locations.reduce((s, r) => s + r.count, 0),
      61,
    );
  }
});
test("capacity_units_and_zero_are_preserved", async () => {
  const { analytics: a } = await queryBoardRoom(actor, {});
  assert.ok(a);
  assert.equal(a.capacity.find((r) => r.unit === "MWp")?.total, "0");
  assert.equal(a.capacity.find((r) => r.unit === "MWp")?.measuredCount, 1);
  assert.equal(a.capacity.find((r) => r.unit === "custom")?.total, "10");
  assert.equal(a.missingCapacity.projects, 1);
});
test("year_strip_retains_all_years", async () => {
  const data = await queryBoardRoom(actor, { year: "2026" });
  assert.equal(data.summary.total, 30);
  assert.equal(
    data.summary.years.reduce((s, r) => s + r.total, 0),
    61,
  );
});
test("dashboard_filters_round_trip", async () => {
  const q = querySchema.parse({
    location: "Kalimantan",
    unit: "MWp",
    assetCoverage: "unlinked",
  });
  assert.equal(q.location, "Kalimantan");
  assert.equal(boardViewFiltersSchema.parse({ query: q }).query.unit, "MWp");
  assert.equal((await queryBoardRoom(actor, q)).summary.total, 1);
  assert.equal(
    (await queryBoardRoom(actor, { missingLocation: true })).summary.total,
    1,
  );
  await assert.rejects(
    queryBoardRoom(actor, { location: "Kalimantan", missingLocation: true }),
    { status: 400 },
  );
});
test("empty_page_retains_connection_totals", async () => {
  const { assetConnections } = await import("../src/lib/assets/explore");
  const result = await assetConnections(actor, { page: 999 });
  assert.equal(result.total, 61);
  assert.equal(result.projects.length, 0);
  assert.equal(result.assetTotal, 0);
  const filtered = await assetConnections(actor, {
    overview: { year: "2026" },
  });
  assert.equal(filtered.total, 30);
});
test("asset filters and readiness reconcile without duplicating projects", async () => {
  const { db } = await database();
  const p = (
    await db.execute(
      sql`SELECT id FROM board_room_project WHERE external_id='DASH-1'`,
    )
  ).rows[0];
  await db.execute(
    sql`INSERT INTO board_asset(id,code,project_id,data) VALUES(gen_random_uuid(),'A-1',${p.id},'{"name":"Asset 1","category":"Pembangkit","capacity":12,"unit":"MW","location":"Kalimantan","voltage":"150 kV"}'::jsonb),(gen_random_uuid(),'A-2',${p.id},'{"name":"Asset 2","category":"Gardu Induk","capacity":13,"unit":"MVA"}'::jsonb),(gen_random_uuid(),'A-U',NULL,'{"name":"Unassigned","category":"Transmisi"}'::jsonb)`,
  );
  const a = (await queryBoardRoom(actor, {})).analytics;
  assert.equal(a.linkedAssets, 2);
  assert.equal(a.coverage.linked, 1);
  assert.equal(a.coverage.unlinked, 60);
  assert.equal(a.coverage.unassignedPortfolioAssets, 1);
  assert.equal(
    a.assetCategories.reduce((s, r) => s + r.count, 0),
    2,
  );
  const { queryAssets } = await import("../src/lib/assets/service");
  assert.equal(
    (await queryAssets(actor, { unit: "MW", projectScope: { year: "2027" } }))
      .total,
    1,
  );
  assert.equal(
    (await queryAssets(actor, { unit: "MW", projectScope: { year: "2026" } }))
      .total,
    0,
  );
  const { assetConnections } = await import("../src/lib/assets/explore");
  assert.equal(
    (await assetConnections(actor, { assetCategory: "Gardu Induk" })).total,
    1,
  );
  assert.equal(
    (await assetConnections(actor, { assetCategory: "Gardu Induk" }))
      .assetTotal,
    1,
  );
  await assert.rejects(
    assetConnections(
      { email: "inactive@example.com", name: "Inactive", isAdmin: false },
      {},
    ),
    { status: 403 },
  );
  // Historical review flag without a current file cannot overlap with No files.
  await db.execute(
    sql`UPDATE board_room_project SET reviewed_revision=document_revision WHERE id=${p.id}`,
  );
  const data = await queryBoardRoom(actor, {});
  assert.equal(data.summary.valid, 0);
  assert.equal(data.summary.needsReview, 0);
  assert.equal(data.summary.noFiles, 61);
});
test("malformed chart scope is a validation error rather than a server error", async () => {
  const { queryAssets } = await import("../src/lib/assets/service");
  const { assetConnections } = await import("../src/lib/assets/explore");
  await assert.rejects(queryAssets(actor, { projectScope: "{bad json" }), {
    name: "ZodError",
  });
  await assert.rejects(assetConnections(actor, { overview: "{bad json" }), {
    name: "ZodError",
  });
});
