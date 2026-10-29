import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import { queryBoardRoom } from "../src/lib/board-room/service";
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
  dir = await mkdtemp(join(tmpdir(), "evolve-regional-"));
  process.env.EVOLVE_DATA_DIR = dir;
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (s: string) => Promise<unknown> } }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  await db.execute(
    sql`INSERT INTO board_room_project(id,external_id,data) SELECT gen_random_uuid(),'DASH-'||n,jsonb_build_object('name','Project '||n,'externalId','DASH-'||n,'category','Pembangkit','stage',0,'completed',false,'codYear',CASE WHEN n=61 THEN NULL ELSE 2026+n%2 END,'location',CASE WHEN n=61 THEN '' WHEN n<=10 THEN 'Kalbar' WHEN n<=20 THEN 'Central Kalimantan' WHEN n<=30 THEN '63' WHEN n<=40 THEN 'ID-KI' WHEN n<=50 THEN 'Kalimantan Utara' ELSE 'Kalimantan' END,'capacity',CASE WHEN n=61 THEN NULL WHEN n=1 THEN 0 ELSE 10 END,'unit',CASE WHEN n=1 THEN 'MWp' WHEN n=2 THEN 'custom' ELSE 'MW' END) FROM generate_series(1,61) n`,
  );
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("regional analytics reconcile comparison and matching scopes beyond pagination", async () => {
  for (const page of [1, 999]) {
    const d = await queryBoardRoom(actor, { region: "ID-KB", page });
    assert.ok(d.analytics.regions, "regional analytics required");
    const r = d.analytics.regions;
    assert.equal(r.contextTotal, 61);
    assert.equal(r.matchingTotal, 10);
    assert.equal(d.summary.total, 10);
    assert.deepEqual(
      r.provinces.map((p) => p.contextCount),
      [10, 10, 10, 10, 10],
    );
    assert.deepEqual(
      r.provinces.map((p) => p.matchingCount),
      [10, 0, 0, 0, 0],
    );
    assert.equal(r.missing.contextCount, 1);
    assert.equal(r.unrecognized.contextCount, 10);
  }
  const filtered = await queryBoardRoom(actor, {
    region: "ID-KU",
    category: "Pembangkit",
    year: "2026",
  });
  assert.equal(filtered.summary.total, 5);
  assert.equal(filtered.analytics.regions.contextTotal, 30);
  assert.equal(
    (await queryBoardRoom(actor, { region: "missing" })).summary.total,
    1,
  );
  assert.equal(
    (await queryBoardRoom(actor, { region: "unrecognized" })).summary.total,
    10,
  );
  await assert.rejects(
    queryBoardRoom(actor, { region: "ID-KB", location: "Kalbar" }),
    { status: 400 },
  );
  const saved = boardViewFiltersSchema.parse({ query: { region: "ID-KU" } });
  assert.equal(saved.query.region, "ID-KU");
  assert.equal(boardViewFiltersSchema.parse({ query: {} }).query.region, "");
});
test("SQL and client classify every alias identically", async () => {
  const { PROVINCES, provinceAliases, classifyRegion } =
    await import("../src/lib/board-room/regions");
  const { regionExpression } =
    await import("../src/lib/board-room/region-query");
  const { db } = await database();
  for (const value of [
    ...PROVINCES.flatMap((p) => [
      p.name,
      p.english,
      p.bps,
      p.code,
      p.short,
      ...provinceAliases(p),
    ]),
    " \t ",
    "---",
    "Pontianak",
    "Kalimantan Barat; Kalimantan Tengah",
  ]) {
    const result = await db.execute(
      sql`SELECT ${regionExpression(sql`${value}::text`)} AS region`,
    );
    assert.equal(result.rows[0].region, classifyRegion(value), value);
  }
});
test("regional scope persists through asset queries, connections, exports, reports and saved views", async () => {
  const { db } = await database();
  const rows = await db.execute(
    sql`SELECT id,external_id FROM board_room_project WHERE external_id IN ('DASH-1','DASH-11') ORDER BY external_id`,
  );
  const west = String(rows.rows.find((r) => r.external_id === "DASH-1")!.id),
    central = String(rows.rows.find((r) => r.external_id === "DASH-11")!.id);
  await db.execute(
    sql`INSERT INTO board_asset(id,code,project_id,data) VALUES(gen_random_uuid(),'REG-WEST',${west},'{"name":"West asset","category":"Pembangkit","capacity":25,"unit":"MW"}'),(gen_random_uuid(),'REG-CENTRAL',${central},'{"name":"Central asset","category":"Transmisi"}')`,
  );
  const { queryAssets } = await import("../src/lib/assets/service");
  const assets = await queryAssets(actor, {
    projectScope: { region: "ID-KB" },
  });
  assert.equal(assets.total, 1);
  assert.equal(assets.items[0].code, "REG-WEST");
  const { assetConnections } = await import("../src/lib/assets/explore");
  const graph = await assetConnections(actor, {
    overview: { region: "ID-KB" },
  });
  assert.equal(graph.total, 10);
  assert.equal(graph.assetTotal, 1);
  const { canonicalProjectExport } =
    await import("../src/lib/connected/project-csv");
  const csv = await canonicalProjectExport(actor, { region: "ID-KB" });
  assert.equal(csv.split("\r\n").length, 11);
  assert.ok(!csv.includes("Project 11"));
  const { boardPortfolioReport } =
    await import("../src/lib/board-room/portfolio-report");
  const report = await boardPortfolioReport(actor, { region: "ID-KB" });
  assert.equal(report.rows.length, 10);
  const { boardViewCommand, readBoardViews } =
    await import("../src/lib/board-room/saved-views");
  const { view } = await boardViewCommand(actor, "create", {
    name: "West regional view",
    filters: {
      query: { region: "ID-KB" },
      section: "overview",
      view: "timeline",
    },
  });
  assert.ok(view);
  assert.equal(
    (await readBoardViews(actor)).views[0].filters.query.region,
    "ID-KB",
  );
});
test("regional category breakdown sums to distinct province totals, including uncategorized", async () => {
  const d = await queryBoardRoom(actor, {});
  for (const row of [
    ...d.analytics.regions.provinces,
    d.analytics.regions.missing,
    d.analytics.regions.unrecognized,
  ]) {
    assert.ok(row.categories, "category breakdown required");
    assert.equal(
      row.categories!.reduce((n, c) => n + c.contextCount, 0),
      row.contextCount,
    );
    assert.equal(
      row.categories!.reduce((n, c) => n + c.matchingCount, 0),
      row.matchingCount,
    );
    assert.deepEqual(
      row.categories!.map((c) => c.category),
      ["Pembangkit", "Transmisi", "Gardu Induk", "uncategorized"],
    );
  }
});
test("mixed canonical and unclassified categories reconcile with missing and unknown regions", async () => {
  const { db } = await database();
  const fixture = [
    ["Pembangkit", "Kalbar"],
    ["Transmisi", "West Kalimantan"],
    ["Gardu Induk", "61"],
    ["Pembangkit", "ID-KU"],
    ["", ""],
    [null, "Unknown place"],
    ["Legacy unknown", "Kalimantan Timur"],
  ];
  for (let i = 0; i < fixture.length; i++) {
    const [category, location] = fixture[i];
    await db.execute(
      sql`INSERT INTO board_room_project(id,external_id,data) VALUES(${crypto.randomUUID()},${"MIX-REG-" + i},jsonb_build_object('name',${"Mixed regional " + i}::text,'category',${category}::text,'location',${location}::text,'stage',0,'completed',false))`,
    );
  }
  const d = await queryBoardRoom(actor, { search: "Mixed regional" });
  assert.equal(d.summary.total, 7);
  const rows = [
    ...d.analytics.regions.provinces,
    d.analytics.regions.missing,
    d.analytics.regions.unrecognized,
  ];
  assert.equal(
    rows.reduce((n, r) => n + r.matchingCount, 0),
    7,
  );
  const totals = [
    "Pembangkit",
    "Transmisi",
    "Gardu Induk",
    "uncategorized",
  ].map((c) =>
    rows.reduce(
      (n, r) =>
        n + (r.categories?.find((x) => x.category === c)?.matchingCount ?? 0),
      0,
    ),
  );
  assert.deepEqual(totals, [2, 1, 1, 3]);
  const filtered = await queryBoardRoom(actor, {
    search: "Mixed regional",
    category: "uncategorized",
  });
  assert.equal(filtered.summary.total, 3);
  assert.equal(filtered.analytics.regions.matchingTotal, 3);
  assert.equal(filtered.analytics.regions.missing.matchingCount, 1);
  assert.equal(filtered.analytics.regions.unrecognized.matchingCount, 1);
  for (const page of [1, 999])
    assert.equal(
      (
        await queryBoardRoom(actor, {
          search: "Mixed regional",
          region: "ID-KB",
          page,
        })
      ).summary.total,
      3,
    );
});
