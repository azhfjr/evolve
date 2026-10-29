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
process.env.ADMIN_EMAIL = "asset-admin@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true };
const member = {
  email: "asset-member@example.test",
  name: "Member",
  isAdmin: false,
};
let dir: string;
const projectId = crypto.randomUUID();
const secondId = crypto.randomUUID();
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-assets-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (q: string) => Promise<unknown> } }
    ).$client.exec(await readFile("migrations/" + name, "utf8"));
  await db
    .insert(s.member)
    .values([admin, member].map((a) => ({ email: a.email, name: a.name })));
  const { projectSchema } = await import("../src/lib/board-room/model");
  for (const id of [projectId, secondId])
    await db.insert(s.boardRoomProject).values({
      id,
      externalId: id,
      data: {
        ...projectSchema.parse({ externalId: id, name: id }),
        stage: 0,
        completed: false,
      },
    });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("asset template and parser preserve blank updates, reject duplicate codes and invalid capacity", async () => {
  const a = await import("../src/lib/assets/model");
  assert.equal(
    a.ASSET_HEADERS.join(","),
    "RUPTL Code,Asset name,Primary category,Capacity,Capacity unit,Location,Voltage,Project ID",
  );
  assert.equal(
    a.parseAssetCSV(
      "RUPTL Code,Asset name,Primary category\n kal-1 ,Station,Gardu Induk",
    )[0].values.code,
    "KAL-1",
  );
  assert.throws(
    () => a.parseAssetCSV("RUPTL Code,Asset name\nA,One\na,Two"),
    /Duplicate/,
  );
  assert.throws(
    () => a.parseAssetCSV("RUPTL Code,Capacity\nA,-3"),
    /capacity/i,
  );
});
test("asset writes enforce admin, immutable code, versions and explicit reassignment", async () => {
  const { assetCommand, queryAssets } =
    await import("../src/lib/assets/service");
  await assert.rejects(
    assetCommand(member, {
      action: "save",
      values: { code: "A-1", name: "A", category: "Transmisi" },
    }),
    /admin/i,
  );
  const created = (await assetCommand(admin, {
    action: "save",
    values: { code: "A-1", name: "Line", category: "Transmisi", projectId },
  })) as { asset: { id: string; version: number } };
  await assert.rejects(
    assetCommand(admin, {
      action: "save",
      id: created.asset.id,
      version: created.asset.version,
      values: {
        code: "A-1",
        name: "Line",
        category: "Transmisi",
        projectId: secondId,
      },
    }),
    /reassign/i,
  );
  await assetCommand(admin, {
    action: "assign",
    id: created.asset.id,
    version: created.asset.version,
    projectId: secondId,
  });
  await assert.rejects(
    assetCommand(admin, {
      action: "assign",
      id: created.asset.id,
      version: created.asset.version,
      projectId,
    }),
    /changed/i,
  );
  assert.equal(
    (await queryAssets(member, { projectId: secondId })).items.length,
    1,
  );
  await assert.rejects(
    assetCommand(admin, { action: "delete", id: created.asset.id, version: 2 }),
    /connected/i,
  );
});
test("asset import rechecks preview and applies all rows atomically", async () => {
  const { assetCommand, queryAssets } =
    await import("../src/lib/assets/service");
  const source =
    "RUPTL Code,Asset name,Primary category,Capacity,Capacity unit\nIMP-1,Imported,Pembangkit,10,MW\nIMP-2,Imported two,Transmisi,20,kms";
  const preview = (await assetCommand(admin, {
    action: "preview",
    source,
  })) as { token: string };
  await assetCommand(admin, {
    action: "save",
    values: { code: "IMP-1", name: "Concurrent", category: "Pembangkit" },
  });
  await assert.rejects(
    assetCommand(admin, { action: "commit", source, token: preview.token }),
    /preview/i,
  );
  assert.equal((await queryAssets(admin, { q: "IMP-2" })).total, 0);
  const fresh = (await assetCommand(admin, { action: "preview", source })) as {
    token: string;
  };
  await assetCommand(admin, { action: "commit", source, token: fresh.token });
  assert.equal((await queryAssets(admin, { q: "IMP-" })).total, 2);
  const before = (await queryAssets(admin, { q: "IMP-1" })).items[0];
  const blanks = "RUPTL Code,Asset name,Capacity\nIMP-1,,\n";
  const b = (await assetCommand(admin, {
    action: "preview",
    source: blanks,
  })) as { token: string };
  await assetCommand(admin, {
    action: "commit",
    source: blanks,
    token: b.token,
  });
  assert.equal(
    (await queryAssets(admin, { q: "IMP-1" })).items[0].capacity,
    before.capacity,
  );
  const { db } = await database();
  const count = await db.execute(
    sql`SELECT count(*)::int AS n FROM board_asset`,
  );
  assert.ok(Number(count.rows[0].n) >= 3);
});
test("quality explains mixed-unit differences and connections retain empty projects", async () => {
  const { assetQuality, assetConnections } =
    await import("../src/lib/assets/explore");
  await assert.rejects(assetQuality(member), /admin/i);
  const quality = await assetQuality(admin);
  assert.ok(quality.checkedAt);
  assert.ok(quality.issues.some((i) => i.kind === "unassigned"));
  const map = await assetConnections(member, {});
  assert.ok(map.projects.some((p) => p.id === projectId));
  assert.ok(map.unassigned > 0);
});
test("project asset selection is atomic and cannot take an assigned asset", async () => {
  const { assetCommand } = await import("../src/lib/assets/service");
  const { boardRoomCommand } = await import("../src/lib/board-room/service");
  const { projectSchema } = await import("../src/lib/board-room/model");
  const a = (await assetCommand(admin, {
    action: "save",
    values: { code: "LINK-1", name: "Link", category: "Transmisi" },
  })) as { asset: { id: string } };
  const first = (await boardRoomCommand(admin, {
    action: "saveProject",
    values: projectSchema.parse({ externalId: "LINK-P1", name: "First link" }),
    assetIds: [a.asset.id],
  })) as { project: { id: string } };
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "saveProject",
      values: projectSchema.parse({
        externalId: "LINK-P2",
        name: "Must roll back",
      }),
      assetIds: [a.asset.id],
    }),
    /assigned/i,
  );
  const { db } = await database();
  assert.equal(
    (
      await db.execute(
        sql`SELECT count(*)::int n FROM board_room_project WHERE external_id='LINK-P2'`,
      )
    ).rows[0].n,
    0,
  );
  assert.ok(first.project.id);
});
test("canonical project CSV uses stable project IDs and linked asset codes", async () => {
  const { canonicalProjectImport, canonicalProjectExport } =
    await import("../src/lib/connected/project-csv");
  const text =
    "Project ID,Project name,Primary category,Asset RUPTL codes\n,CSV canonical project,Transmisi,IMP-2";
  const p = (await canonicalProjectImport(admin, {
    action: "canonicalPreview",
    source: text,
  })) as { token: string };
  const result = (await canonicalProjectImport(admin, {
    action: "canonicalCommit",
    source: text,
    token: p.token,
  })) as { counts: { new: number } };
  assert.equal(result.counts.new, 1);
  const exported = await canonicalProjectExport(member, {});
  assert.match(exported, /^"Project ID"/);
  assert.match(exported, /IMP-2/);
  assert.ok(!exported.split("\r\n")[0].includes("Scope"));
});
test("project creation retries recover the same saved project after a lost response", async () => {
  const { boardRoomCommand } = await import("../src/lib/board-room/service");
  const { projectSchema } = await import("../src/lib/board-room/model");
  const payload = {
    action: "saveProject",
    requestId: crypto.randomUUID(),
    values: projectSchema.parse({
      externalId: "REPLAY-PROJECT",
      name: "Recoverable project",
    }),
    assetIds: [],
  };
  const a = (await boardRoomCommand(admin, payload)) as {
      project: { id: string };
    },
    b = (await boardRoomCommand(admin, payload)) as { project: { id: string } };
  assert.equal(a.project.id, b.project.id);
});
test("repeat asset and canonical project previews report unchanged records regardless of JSON key order", async () => {
  const { assetCommand } = await import("../src/lib/assets/service");
  const source =
    "RUPTL Code,Asset name,Primary category\nORDER-1,Stable order,Pembangkit";
  const p = (await assetCommand(admin, { action: "preview", source })) as {
    token: string;
  };
  await assetCommand(admin, { action: "commit", source, token: p.token });
  const repeat = (await assetCommand(admin, { action: "preview", source })) as {
    counts: { unchanged: number };
  };
  assert.equal(repeat.counts.unchanged, 1);
  const { canonicalProjectImport } =
    await import("../src/lib/connected/project-csv");
  const text =
    "Project ID,Project name,Primary category\n,Stable project order,Pembangkit";
  const pp = (await canonicalProjectImport(admin, {
    action: "canonicalPreview",
    source: text,
  })) as { token: string };
  await canonicalProjectImport(admin, {
    action: "canonicalCommit",
    source: text,
    token: pp.token,
  });
  const pr = (await canonicalProjectImport(admin, {
    action: "canonicalPreview",
    source: text,
  })) as { counts: { unchanged: number } };
  assert.equal(pr.counts.unchanged, 1);
});
test("asset connection changes invalidate stale project forms instead of unlinking new work", async () => {
  const { boardRoomDetail, boardRoomCommand } =
    await import("../src/lib/board-room/service");
  const { assetCommand } = await import("../src/lib/assets/service");
  const { projectSchema } = await import("../src/lib/board-room/model");
  const before = (await boardRoomDetail(admin, projectId)).project;
  await assetCommand(admin, {
    action: "save",
    values: {
      code: "SYNC-LINK",
      name: "Concurrent link",
      category: "Transmisi",
      projectId,
    },
  });
  const values = projectSchema.parse(
    Object.fromEntries(
      Object.keys(projectSchema.shape).map((k) => [
        k,
        before[k as keyof typeof before],
      ]),
    ),
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "saveProject",
      id: projectId,
      version: before.version,
      values,
      assetIds: [],
    }),
    /changed/i,
  );
});
test("asset import receipt replay rejects changed source data", async () => {
  const { assetCommand } = await import("../src/lib/assets/service");
  const source =
    "RUPTL Code,Asset name,Primary category\nHASH-1,Original,Pembangkit";
  const p = (await assetCommand(admin, { action: "preview", source })) as {
    token: string;
  };
  await assetCommand(admin, { action: "commit", source, token: p.token });
  await assert.rejects(
    assetCommand(admin, {
      action: "commit",
      source: source.replace("Original", "Changed"),
      token: p.token,
    }),
    /changed/i,
  );
});
