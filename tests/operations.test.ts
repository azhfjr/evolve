import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyOperations,
  recoverySummary,
  evidenceInputSchema,
} from "../src/lib/operations-model";
const now = new Date("2026-10-24T12:00:00Z");
const metrics = {
  storageBytes: 0,
  calendarPending: 0,
  calendarFailed: 0,
  calendarOverdue: 0,
  cleanupOverdue: 0,
};
test("maintenance freshness is unknown initially and overdue only after 36 hours", () => {
  assert.equal(
    classifyOperations(metrics, null, now)[0]?.code,
    "maintenance_unobserved",
  );
  assert.equal(
    classifyOperations(metrics, { completedAt: "2026-10-23T00:00:00Z" }, now)
      .length,
    0,
  );
  assert.equal(
    classifyOperations(metrics, { completedAt: "2026-10-22T23:59:59Z" }, now)[0]
      ?.code,
    "maintenance_overdue",
  );
});
test("acknowledgment cannot erase resource and background work signals", () => {
  const signals = classifyOperations(
    {
      ...metrics,
      storageBytes: 1024 ** 3,
      calendarFailed: 2,
      cleanupOverdue: 1,
    },
    { failedAt: now.toISOString() },
    now,
  );
  assert.deepEqual(signals.map((s) => s.code).sort(), [
    "calendar_failures",
    "cleanup_backlog",
    "maintenance_failed",
    "maintenance_unobserved",
    "storage_critical",
  ]);
});
test("recovery targets remain distinct from admin-reported evidence", () => {
  assert.equal(recoverySummary(null, now).status, "unverified");
  const evidence = evidenceInputSchema.parse({
    databaseBackupAt: "2026-10-24T10:00:00Z",
    fileBackupAt: null,
    drillCompletedAt: null,
    restoreMinutes: null,
    dataLossMinutes: null,
    reference: "Separate recovery record",
  });
  const summary = recoverySummary(evidence, now);
  assert.equal(summary.status, "admin_reported");
  assert.equal(summary.productionRestoreVerified, false);
  assert.equal(summary.fileBackupWithinTarget, null);
  assert.equal(summary.databaseBackupWithinTarget, true);
  assert.equal(summary.drillWithinTarget, null);
  assert.equal(
    evidenceInputSchema.safeParse({ ...evidence, providerVerified: true })
      .success,
    false,
  );
});

test("maintenance rejects missing, short and incorrect authorization before doing work", async () => {
  const { GET } = await import("../src/app/api/maintenance/route");
  const before = process.env.CRON_SECRET;
  const cached = Reflect.get(globalThis, "evolveDb");
  let databaseWrites = 0;
  Reflect.set(
    globalThis,
    "evolveDb",
    Promise.resolve({
      db: {
        execute: async () => {
          databaseWrites++;
          return { rows: [] };
        },
      },
      close: async () => {},
    }),
  );
  try {
    delete process.env.CRON_SECRET;
    assert.equal(
      (await GET(new Request("http://localhost/api/maintenance"))).status,
      503,
    );
    process.env.CRON_SECRET = "short";
    assert.equal(
      (
        await GET(
          new Request("http://localhost/api/maintenance", {
            headers: { authorization: "Bearer short" },
          }),
        )
      ).status,
      503,
    );
    process.env.CRON_SECRET = "operations-test-only-32-character-secret";
    assert.equal(
      (await GET(new Request("http://localhost/api/maintenance"))).status,
      401,
    );
    assert.equal(
      (
        await GET(
          new Request("http://localhost/api/maintenance", {
            headers: {
              authorization: "Bearer operations-test-only-wrong-secret",
            },
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      databaseWrites,
      0,
      "Rejected cron requests cannot write a heartbeat or execute maintenance SQL",
    );
  } finally {
    if (cached === undefined) Reflect.deleteProperty(globalThis, "evolveDb");
    else Reflect.set(globalThis, "evolveDb", cached);
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});

test("daily maintenance configuration is a redacted classification signal", () => {
  const heartbeat = { completedAt: now.toISOString() };
  assert.deepEqual(classifyOperations(metrics, heartbeat, now, true), []);
  const missing = classifyOperations(metrics, heartbeat, now, false);
  assert.equal(missing[0]?.code, "maintenance_auth_unconfigured");
  assert.equal(missing[0]?.severity, "critical");
});
