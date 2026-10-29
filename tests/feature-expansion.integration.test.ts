import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { projectSchema } from "../src/lib/board-room/model";
import { boardRoomCommand } from "../src/lib/board-room/service";
import { projectCosts, saveProjectCosts } from "../src/lib/board-room/costs";
import {
  readTemplate,
  templateCommand,
} from "../src/lib/project-template/service";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "expansion@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true },
  member = {
    email: "expansion-member@example.test",
    name: "Member",
    isAdmin: false,
  };
let dir: string;
const projectId = crypto.randomUUID();
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-expansion-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
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
  await db.execute(
    sql`UPDATE connected_workspace SET enabled=true WHERE id='primary'`,
  );
  await db.insert(s.boardRoomProject).values({
    id: projectId,
    externalId: "EXPANSION-1",
    data: {
      ...projectSchema.parse({
        externalId: "EXPANSION-1",
        name: "Expansion project",
        codYear: 2028,
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
test("Board costs reuse canonical records, retain precision, audit writes and reject member/stale updates", async () => {
  const option = {
    id: crypto.randomUUID(),
    title: "Option A",
    items: [
      {
        id: crypto.randomUUID(),
        title: "Equipment",
        unit: "USD",
        amount: "125.50",
      },
      {
        id: crypto.randomUUID(),
        title: "Energy",
        unit: "cUSD/kWh",
        amount: "0.123456",
      },
    ],
  };
  const revisionBefore = Number(
    (
      await (
        await database()
      ).db.execute(
        sql`SELECT revision FROM board_room_config WHERE id='primary'`,
      )
    ).rows[0].revision,
  );
  const before = await projectCosts(member, projectId);
  await assert.rejects(
    saveProjectCosts(member, projectId, {
      version: before.version,
      options: [option],
    }),
    /admin/i,
  );
  const saved = await saveProjectCosts(admin, projectId, {
    version: before.version,
    options: [option],
  });
  assert.deepEqual(saved.options, [option]);
  assert.equal(
    Number(
      (
        await (
          await database()
        ).db.execute(
          sql`SELECT revision FROM board_room_config WHERE id='primary'`,
        )
      ).rows[0].revision,
    ),
    revisionBefore + 1,
    "Board history refresh revision",
  );
  await assert.rejects(
    saveProjectCosts(admin, projectId, {
      version: before.version,
      options: [],
    }),
    /changed/i,
  );
  const { db } = await database();
  assert.deepEqual(
    (
      await db.execute(
        sql`SELECT cost_options FROM project WHERE id=${projectId}`,
      )
    ).rows[0].cost_options,
    [option],
  );
  assert.ok(
    (
      await db.execute(
        sql`SELECT id FROM board_room_history WHERE project_id=${projectId} AND kind='project_costs_updated'`,
      )
    ).rows.length,
  );
  await assert.rejects(
    saveProjectCosts(admin, projectId, {
      version: saved.version,
      options: [
        { ...option, items: [{ ...option.items[1], amount: "0.1234567" }] },
      ],
    }),
  );
});
test("template publish/sync is admin-only, versioned, idempotent and preserves legacy values and required unsets", async () => {
  const option = crypto.randomUUID();
  const def = {
    fields: [
      {
        key: "delivery_class",
        label: "Delivery class",
        guidance: "Choose a class.",
        required: true,
        active: true,
        options: [{ id: option, label: "Priority", active: true }],
      },
    ],
  };
  const config = await readTemplate(admin, undefined, true);
  await assert.rejects(
    templateCommand(member, {
      action: "saveDraft",
      version: config.version,
      definition: def,
    }),
    /admin/i,
  );
  const draft = await templateCommand(admin, {
    action: "saveDraft",
    version: config.version,
    definition: def,
  });
  const published = await templateCommand(admin, {
    action: "publish",
    version: draft.version,
  });
  assert.equal(published.publishedRevision, 1);
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "saveProject",
      values: projectSchema.parse({
        externalId: "MISSING-CUSTOM",
        name: "Missing",
      }),
    }),
    /Delivery class/,
  );
  const preview = await templateCommand(admin, { action: "syncPreview" });
  assert.equal(preview.changedProjects, 1);
  const synced = await templateCommand(admin, {
    action: "syncCommit",
    token: preview.token,
  });
  assert.equal(synced.changedProjects, 1);
  assert.deepEqual(
    await templateCommand(admin, {
      action: "syncCommit",
      token: preview.token,
    }),
    synced,
  );
  const assigned = await readTemplate(member, projectId);
  assert.equal(assigned.revision, 1);
  assert.deepEqual(assigned.values, {});
  const { db } = await database();
  const row = (
    await db.execute(
      sql`SELECT version,data FROM board_room_project WHERE id=${projectId}`,
    )
  ).rows[0];
  const oldValues = Object.fromEntries(
    Object.entries(row.data as object).filter(([key]) =>
      Object.hasOwn(projectSchema.shape, key),
    ),
  );
  await boardRoomCommand(admin, {
    action: "saveProject",
    id: projectId,
    version: row.version,
    values: { ...oldValues, name: "Renamed" },
  });
  const current = (
    await db.execute(
      sql`SELECT version,data FROM board_room_project WHERE id=${projectId}`,
    )
  ).rows[0];
  const values = Object.fromEntries(
    Object.entries(current.data as object).filter(([key]) =>
      Object.hasOwn(projectSchema.shape, key),
    ),
  );
  await boardRoomCommand(admin, {
    action: "saveProject",
    id: projectId,
    version: current.version,
    values: { ...values, customValues: { delivery_class: option } },
  });
  const saved = await readTemplate(member, projectId);
  assert.equal(saved.values.delivery_class, option);
  const managed = await readTemplate(admin, undefined, true);
  const next = {
    fields: [
      {
        ...def.fields[0],
        label: "Delivery grouping",
        options: [
          { id: option, label: "Old Priority", active: false },
          { id: crypto.randomUUID(), label: "Standard", active: true },
        ],
      },
    ],
  };
  const d2 = await templateCommand(admin, {
    action: "saveDraft",
    version: managed.version,
    definition: next,
  });
  await templateCommand(admin, { action: "publish", version: d2.version });
  const p2 = await templateCommand(admin, { action: "syncPreview" });
  assert.equal(p2.renamedOptions, 1);
  assert.equal(p2.deactivatedOptions, 1);
  await templateCommand(admin, { action: "syncCommit", token: p2.token });
  assert.equal(
    (await readTemplate(member, projectId)).values.delivery_class,
    option,
  );
});
test("template preview conflicts preserve all projects and published revisions cannot mutate", async () => {
  const { db } = await database();
  const preview = await templateCommand(admin, { action: "syncPreview" });
  await db.execute(
    sql`UPDATE board_room_project SET version=version+1 WHERE id=${projectId}`,
  );
  await assert.rejects(
    templateCommand(admin, { action: "syncCommit", token: preview.token }),
    { status: 409 },
  );
  await assert.rejects(
    db.execute(
      sql`UPDATE project_template_revision SET definition='{"fields":[]}' WHERE revision=1`,
    ),
    (e: unknown) =>
      /immutable/i.test(String((e as { cause?: Error }).cause?.message)),
  );
  await assert.rejects(templateCommand(member, { action: "syncPreview" }), {
    status: 403,
  });
  const managed = await readTemplate(admin, undefined, true);
  await assert.rejects(
    templateCommand(admin, {
      action: "saveDraft",
      version: managed.version - 1,
      definition: managed.definition,
    }),
    { status: 409 },
  );
  await assert.rejects(
    templateCommand(admin, {
      action: "saveDraft",
      version: managed.version,
      definition: { fields: [] },
    }),
    /Deactivate/,
  );
});
test("concurrent Board cost writes have exactly one winner and do not overwrite project metadata", async () => {
  const current = await projectCosts(admin, projectId);
  const results = await Promise.allSettled([
    saveProjectCosts(admin, projectId, {
      version: current.version,
      options: current.options,
    }),
    saveProjectCosts(admin, projectId, {
      version: current.version,
      options: [],
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const { db } = await database();
  assert.equal(
    (
      await db.execute(
        sql`SELECT data->>'name' AS name FROM board_room_project WHERE id=${projectId}`,
      )
    ).rows[0].name,
    "Renamed",
  );
});
test("custom metadata CSV round-trips stable identities and filters without changing primary taxonomy", async () => {
  const { canonicalProjectExport } =
    await import("../src/lib/connected/project-csv");
  const { queryBoardRoom } = await import("../src/lib/board-room/service");
  const value = (await readTemplate(member, projectId)).values.delivery_class!;
  const result = await queryBoardRoom(admin, {
    customField: "delivery_class",
    customOption: value,
  });
  assert.equal(result.summary.total, 1);
  assert.equal(result.projects[0].id, projectId);
  const exported = await canonicalProjectExport(admin, {
    customField: "delivery_class",
    customOption: value,
  });
  assert.ok(exported.includes("Custom fields"));
  assert.ok(exported.includes(value));
  await assert.rejects(
    queryBoardRoom(admin, { customField: "delivery_class" }),
    { status: 400 },
  );
});

test("rollback clients cannot silently discard pinned custom metadata", async () => {
  const { db } = await database();
  await assert.rejects(
    db.execute(
      sql`UPDATE board_room_project SET data=data-'customValues'-'templateRevision' WHERE id=${projectId}`,
    ),
    (e: unknown) =>
      /metadata|template/i.test(
        String((e as { cause?: Error }).cause?.message),
      ),
  );
  assert.ok((await readTemplate(admin, projectId)).values.delivery_class);
});
