import { connectedOperationMetrics } from "./connected/observability";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { database, type Database } from "./db";
import { AppError, requireAdmin } from "./permissions";
import { assertActorActive } from "./membership";
import type { Actor } from "./types";
import {
  classifyOperations,
  evidenceInputSchema,
  incidentFingerprint,
  recoverySummary,
  type OperationsMetrics,
  type OperationsState,
} from "./operations-model";
const version = z.number().int().positive();
export const operationsCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("runCheck"), version }).strict(),
  z
    .object({
      action: z.literal("acknowledge"),
      version,
      fingerprint: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("saveEvidence"),
      version,
      evidence: evidenceInputSchema,
    })
    .strict(),
]);
async function stateRecord(db: Database) {
  let result;
  try {
    result = await db.execute(
      sql`SELECT version,data FROM operations_state WHERE id='primary'`,
    );
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (failure?.code === "42P01" || failure?.cause?.code === "42P01")
      throw new AppError(
        "Operations schema is not ready. Apply migration 0018.",
        503,
      );
    throw error;
  }
  if (!result.rows[0])
    throw new AppError(
      "Operations schema is not ready. Apply migration 0018.",
      503,
    );
  return result.rows[0] as unknown as {
    version: number;
    data: OperationsState;
  };
}
async function metrics(db: Database): Promise<OperationsMetrics> {
  const result = await db.execute(sql`SELECT
    (SELECT coalesce(sum(size),0)::float8 FROM attachment) AS "storageBytes",
    (SELECT count(*)::int FROM calendar_job) AS "calendarPending",
    (SELECT count(*)::int FROM calendar_job WHERE last_error IS NOT NULL) AS "calendarFailed",
    (SELECT count(*)::int FROM calendar_job j JOIN calendar_connection c ON c.email=j.email JOIN member m ON m.email=j.email WHERE c.enabled AND NOT m.disabled AND coalesce(c.error_code,'')<>'reconnect_required' AND coalesce((SELECT (configuration->>'calendarEnabled')::boolean FROM workspace_setting WHERE id='primary'),true) AND j.available_at<now()-interval '24 hours') AS "calendarOverdue",
    (SELECT count(*)::int FROM attachment WHERE (state='pending' AND created_at<now()-interval '1 hour') OR (state='deleting' AND created_at<now()-interval '70 minutes')) AS "cleanupOverdue"`);
  return result.rows[0] as unknown as OperationsMetrics;
}
export async function operationsReport(actor: Actor, suppliedDb?: Database) {
  requireAdmin(actor);
  const db = suppliedDb || (await database()).db;
  await assertActorActive(db, actor);
  const [record, values] = await Promise.all([stateRecord(db), metrics(db)]);
  const observedAt = new Date();
  const maintenanceAuthenticationConfigured =
    (process.env.CRON_SECRET?.length || 0) >= 32;
  const signals = classifyOperations(
    values,
    record.data.maintenance || null,
    observedAt,
    maintenanceAuthenticationConfigured,
  );
  const fingerprint = incidentFingerprint(signals);
  return {
    version: record.version,
    state: record.data,
    observedAt: observedAt.toISOString(),
    maintenanceAuthenticationConfigured,
    metrics: values,
    connected: await connectedOperationMetrics(db),
    signals,
    fingerprint,
    acknowledged:
      !!fingerprint && record.data.acknowledgment?.fingerprint === fingerprint,
    recovery: recoverySummary(record.data.evidence || null, observedAt),
  };
}
export type OperationsReport = Awaited<ReturnType<typeof operationsReport>>;
export async function operationsCommand(
  actor: Actor,
  input: unknown,
  suppliedDb?: Database,
) {
  requireAdmin(actor);
  const command = operationsCommandSchema.parse(input);
  const db = suppliedDb || (await database()).db;
  await assertActorActive(db, actor);
  const now = new Date().toISOString();
  let patch: Partial<OperationsState>;
  if (command.action === "saveEvidence") {
    for (const stamp of [
      command.evidence.databaseBackupAt,
      command.evidence.fileBackupAt,
      command.evidence.drillCompletedAt,
    ])
      if (stamp && Date.parse(stamp) > Date.parse(now))
        throw new AppError(
          "Recovery evidence timestamps cannot be in the future.",
        );
    patch = {
      evidence: {
        ...command.evidence,
        recordedAt: now,
        recordedBy: actor.email,
      },
    };
  } else if (command.action === "acknowledge") {
    const report = await operationsReport(actor, db);
    if (!report.fingerprint || report.fingerprint !== command.fingerprint)
      throw new AppError(
        "The incident changed. Refresh before acknowledging.",
        409,
      );
    patch = {
      acknowledgment: {
        fingerprint: report.fingerprint,
        at: now,
        by: actor.email,
      },
    };
  } else {
    // A new observation clears acknowledgment when the observed condition set
    // has changed or resolved. Matching ongoing conditions stay acknowledged.
    const report = await operationsReport(actor, db);
    patch = {
      checkedAt: now,
      ...(report.state.acknowledgment?.fingerprint !== report.fingerprint
        ? { acknowledgment: null }
        : {}),
    };
  }
  const updated = await db.execute(
    sql`UPDATE operations_state SET data=data || ${JSON.stringify(patch)}::jsonb,version=version+1 WHERE id='primary' AND version=${command.version} RETURNING version`,
  );
  if (!updated.rows.length)
    throw new AppError(
      "Operations changed. Refresh and retry; your draft is preserved.",
      409,
    );
  return operationsReport(actor, db);
}
// Best effort by design: monitoring persistence must not prevent existing cleanup
// or Calendar work. Completion from an older overlapping run cannot win.
export async function recordMaintenance(
  phase: "start" | "complete" | "fail",
  runId: string,
  suppliedDb?: Database,
) {
  try {
    const db = suppliedDb || (await database()).db;
    const now = new Date().toISOString();
    const patch =
      phase === "start"
        ? { runId, startedAt: now }
        : phase === "complete"
          ? { completedAt: now, failedAt: null }
          : { failedAt: now };
    await db.execute(
      sql`UPDATE operations_state SET data=jsonb_set(data,'{maintenance}',coalesce(data->'maintenance','{}'::jsonb) || ${JSON.stringify(patch)}::jsonb),version=version+1 WHERE id='primary' AND ${phase === "start" ? sql`true` : sql`data->'maintenance'->>'runId'=${runId}`}`,
    );
  } catch {
    console.error("Operations maintenance heartbeat could not be recorded");
  }
}
