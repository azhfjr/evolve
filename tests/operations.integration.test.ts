import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "../src/lib/db";
import {
  operationsReport,
  operationsCommand,
  recordMaintenance,
} from "../src/lib/operations";
const admin = { email: "admin@example.test", name: "Admin", isAdmin: true };
test("operations stores admin evidence with conflicts and isolates heartbeat attempts", async () => {
  const originalAdmin = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = admin.email;
  const client = new PGlite();
  const db = drizzle(client) as unknown as Database;
  await client.exec(await readFile("migrations/0018_operations.sql", "utf8"));
  await client.exec(
    `CREATE TABLE attachment(size integer,state text,created_at timestamptz); CREATE TABLE calendar_job(email text,available_at timestamptz,last_error text); CREATE TABLE calendar_connection(email text,enabled boolean,error_code text); CREATE TABLE member(email text,disabled boolean); CREATE TABLE workspace_setting(id text,configuration jsonb); CREATE TABLE connected_workspace(id text,enabled boolean); CREATE TABLE legacy_record(id text); CREATE TABLE asset_import_finding(resolved boolean); CREATE TABLE board_asset(project_id text); CREATE TABLE board_room_project(id text); CREATE TABLE task(project_id text);`,
  );
  await client.exec(
    await readFile("migrations/0034_connected_observability.sql", "utf8"),
  );
  try {
    await assert.rejects(
      () => operationsReport({ ...admin, isAdmin: false }, db),
      /administrator/,
    );
    await assert.rejects(
      () => operationsReport({ ...admin, email: "forged@example.test" }, db),
      /administrator|administrator|tidak valid/,
    );
    await assert.rejects(() =>
      client.exec("UPDATE operations_state SET data='{}'::jsonb"),
    );
    const initial = await operationsReport(admin, db);
    assert.equal(initial.recovery.status, "unverified");
    assert.equal(initial.state.evidence, undefined);
    const saved = await operationsCommand(
      admin,
      {
        action: "saveEvidence",
        version: initial.version,
        evidence: {
          databaseBackupAt: null,
          fileBackupAt: null,
          drillCompletedAt: null,
          restoreMinutes: null,
          dataLossMinutes: null,
          reference: "Provider retention still awaiting confirmation",
        },
      },
      db,
    );
    assert.equal(saved.state.evidence?.recordedBy, admin.email);
    assert.equal(saved.recovery.productionRestoreVerified, false);
    await assert.rejects(
      () =>
        operationsCommand(
          admin,
          { action: "runCheck", version: initial.version },
          db,
        ),
      /changed/,
    );
    const acknowledged = await operationsCommand(
      admin,
      {
        action: "acknowledge",
        version: saved.version,
        fingerprint: saved.fingerprint,
      },
      db,
    );
    assert.equal(acknowledged.acknowledged, true);
    assert.equal(acknowledged.signals.length > 0, true);
    await recordMaintenance("start", "old", db);
    await recordMaintenance("start", "new", db);
    await recordMaintenance("complete", "old", db);
    assert.equal(
      (await operationsReport(admin, db)).state.maintenance?.completedAt,
      undefined,
    );
    await recordMaintenance("complete", "new", db);
    const finished = await operationsReport(admin, db);
    assert.ok(finished.state.maintenance?.completedAt);
    assert.equal(finished.acknowledged, false);
    const checkedAfterResolution = await operationsCommand(
      admin,
      { action: "runCheck", version: finished.version },
      db,
    );
    assert.equal(
      checkedAfterResolution.state.acknowledgment,
      null,
      "observing changed/resolved conditions clears the old acknowledgment",
    );
    await client.exec(
      `INSERT INTO attachment VALUES (100,'deleting',now()-interval '2 hours'); INSERT INTO member VALUES ('member',false); INSERT INTO calendar_connection VALUES ('member',true,NULL); INSERT INTO calendar_job VALUES ('member',now()-interval '2 days','temporary_error');`,
    );
    const backlog = await operationsReport(admin, db);
    assert.deepEqual(backlog.metrics, {
      storageBytes: 100,
      calendarPending: 1,
      calendarFailed: 1,
      calendarOverdue: 1,
      cleanupOverdue: 1,
    });
    const checked = await operationsCommand(
      admin,
      { action: "runCheck", version: backlog.version },
      db,
    );
    assert.ok(checked.state.checkedAt);
    const precisionEvidence = await operationsCommand(
      admin,
      {
        action: "saveEvidence",
        version: checked.version,
        evidence: {
          databaseBackupAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
          fileBackupAt: null,
          drillCompletedAt: null,
          restoreMinutes: null,
          dataLossMinutes: null,
          reference: "Timestamp without millisecond precision",
        },
      },
      db,
    );
    assert.equal(precisionEvidence.recovery.databaseBackupWithinTarget, true);
    await client.exec("DROP TABLE operations_state");
    await assert.rejects(
      () => operationsReport(admin, db),
      (error: unknown) =>
        error instanceof Error && "status" in error && error.status === 503,
    );
    await client.exec(await readFile("migrations/0018_operations.sql", "utf8"));
    await assert.rejects(
      () =>
        operationsCommand(
          admin,
          {
            action: "saveEvidence",
            version: checked.version,
            evidence: {
              databaseBackupAt: "2999-01-01T00:00:00Z",
              fileBackupAt: null,
              drillCompletedAt: null,
              restoreMinutes: null,
              dataLossMinutes: null,
              reference: "future",
            },
          },
          db,
        ),
      /future/,
    );
  } finally {
    await client.close();
    if (originalAdmin === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdmin;
  }
});

test("heartbeat storage failure is best effort and logs no exception details", async (context) => {
  const messages: unknown[][] = [];
  context.mock.method(console, "error", (...args: unknown[]) =>
    messages.push(args),
  );
  const unavailable = {
    execute: async () => {
      throw new Error("sensitive-database-connection-detail");
    },
  } as unknown as Database;
  await assert.doesNotReject(() =>
    recordMaintenance("start", "run", unavailable),
  );
  assert.deepEqual(messages, [
    ["Operations maintenance heartbeat could not be recorded"],
  ]);
});
