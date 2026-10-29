import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { boardRoomCommand } from "../src/lib/board-room/service";
import { canonicalProjectImport } from "../src/lib/connected/project-csv";
import { projectSchema, type BoardProject } from "../src/lib/board-room/model";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "cod-admin@example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true };
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "evolve-cod-"));
  process.env.EVOLVE_DATA_DIR = join(dir, "db");
  const { db } = await database();
  for (const n of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (q: string) => Promise<unknown> } }
    ).$client.exec(await readFile("migrations/" + n, "utf8"));
  await db.insert(s.member).values({ email: admin.email, name: admin.name });
});
after(async () => {
  await (await database()).close();
  await rm(dir, { recursive: true, force: true });
});
test("direct and canonical/legacy CSV writes consistently enforce COD without invalidating historical records", async () => {
  const values = projectSchema.parse({
    externalId: "COD-HISTORY",
    name: "Historical",
    codYear: 2024,
  });
  await assert.rejects(
    boardRoomCommand(admin, { action: "saveProject", values }),
    /2026.*2040/,
  );
  const { db } = await database();
  await db.execute(
    sql`UPDATE connected_workspace SET enabled=true WHERE id='primary'`,
  );
  const id = crypto.randomUUID();
  await db.insert(s.boardRoomProject).values({
    id,
    externalId: values.externalId,
    data: { ...values, stage: 0, completed: false },
  });
  const saved = (await boardRoomCommand(admin, {
    action: "saveProject",
    id,
    version: 1,
    values: { ...values, name: "Retained" },
  })) as { project: BoardProject };
  assert.equal(saved.project.codYear, 2024);
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "saveProject",
      id,
      version: saved.project.version,
      values: { ...values, codYear: 2023 },
    }),
    /2026.*2040/,
  );
  await assert.rejects(
    canonicalProjectImport(admin, {
      action: "canonicalPreview",
      source: `Project ID,Project name,Planned COD year\n${id},,2023`,
    }),
    /Row 2.*2026.*2040/,
  );
  const preview = (await canonicalProjectImport(admin, {
    action: "canonicalPreview",
    source: `Project ID,Project name,Planned COD year\n${id},Imported,`,
  })) as { token: string };
  const committed = await canonicalProjectImport(admin, {
    action: "canonicalCommit",
    token: preview.token,
    source: `Project ID,Project name,Planned COD year\n${id},Imported,`,
  });
  assert.ok(committed);
  assert.equal(
    (
      await db.execute(
        sql`SELECT data->>'codYear' AS year FROM board_room_project WHERE id=${id}`,
      )
    ).rows[0].year,
    "2024",
  );
  await assert.rejects(
    boardRoomCommand(admin, {
      action: "importPreview",
      source: "Project ID,Project name,Planned COD year\nNEW-COD,New,2041",
    }),
    /2026.*2040/,
  );
});
