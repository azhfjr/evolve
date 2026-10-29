import { z } from "zod";
import { WORKSPACE_FILE_LIMIT } from "./file-management-model";
export const RECOVERY_TARGETS = { rpoHours: 24, rtoHours: 4 } as const;
export const evidenceInputSchema = z
  .object({
    databaseBackupAt: z.iso.datetime().nullable(),
    fileBackupAt: z.iso.datetime().nullable(),
    drillCompletedAt: z.iso.datetime().nullable(),
    restoreMinutes: z.number().int().min(0).max(525600).nullable(),
    dataLossMinutes: z.number().int().min(0).max(525600).nullable(),
    reference: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine(
    (value) =>
      value.drillCompletedAt !== null ||
      (value.restoreMinutes === null && value.dataLossMinutes === null),
    "Record a drill completion timestamp before its measurements.",
  );
export type RecoveryEvidence = z.infer<typeof evidenceInputSchema> & {
  recordedAt?: string;
  recordedBy?: string;
};
export type OperationsMetrics = {
  storageBytes: number;
  calendarPending: number;
  calendarFailed: number;
  calendarOverdue: number;
  cleanupOverdue: number;
};
export type MaintenanceState = {
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string | null;
};
export type OperationsSignal = {
  code: string;
  severity: "warning" | "critical";
  message: string;
};
export type OperationsState = {
  schemaVersion: 1;
  maintenance?: MaintenanceState;
  checkedAt?: string;
  evidence?: RecoveryEvidence;
  acknowledgment?: { fingerprint: string; at: string; by: string } | null;
};
export function classifyOperations(
  metrics: OperationsMetrics,
  maintenance: MaintenanceState | null,
  now = new Date(),
  maintenanceAuthenticationConfigured = true,
): OperationsSignal[] {
  const signals: OperationsSignal[] = [];
  if (!maintenanceAuthenticationConfigured)
    signals.push({
      code: "maintenance_auth_unconfigured",
      severity: "critical",
      message:
        "Daily maintenance authentication is not configured with a server-side secret of at least 32 characters.",
    });
  if (!maintenance?.completedAt)
    signals.push({
      code: "maintenance_unobserved",
      severity: "warning",
      message: "No completed maintenance heartbeat has been observed.",
    });
  else if (+now - +new Date(maintenance.completedAt) > 36 * 3600000)
    signals.push({
      code: "maintenance_overdue",
      severity: "critical",
      message:
        "Maintenance completion is older than 36 hours (daily schedule plus 12 hours grace).",
    });
  if (
    maintenance?.failedAt &&
    (!maintenance.completedAt || maintenance.failedAt > maintenance.completedAt)
  )
    signals.push({
      code: "maintenance_failed",
      severity: "critical",
      message: "The latest observed maintenance attempt failed.",
    });
  const ratio = metrics.storageBytes / WORKSPACE_FILE_LIMIT;
  if (ratio >= 0.95)
    signals.push({
      code: "storage_critical",
      severity: "critical",
      message: "Shared document allocation is at least 95% reserved.",
    });
  else if (ratio >= 0.8)
    signals.push({
      code: "storage_warning",
      severity: "warning",
      message: "Shared document allocation is at least 80% reserved.",
    });
  if (metrics.calendarFailed)
    signals.push({
      code: "calendar_failures",
      severity: "warning",
      message:
        "Calendar jobs have recorded errors; review account connections and retries.",
    });
  if (metrics.calendarOverdue)
    signals.push({
      code: "calendar_backlog",
      severity: "warning",
      message: "Eligible Calendar work has been due for more than 24 hours.",
    });
  if (metrics.cleanupOverdue)
    signals.push({
      code: "cleanup_backlog",
      severity: "warning",
      message:
        "Expired upload reservations or deletion holds remain pending cleanup.",
    });
  return signals;
}
export function incidentFingerprint(signals: OperationsSignal[]) {
  return signals
    .map((signal) => `${signal.severity}:${signal.code}`)
    .sort()
    .join("|");
}
export function recoverySummary(
  evidence: RecoveryEvidence | null,
  now = new Date(),
) {
  const fresh = (value: string | null | undefined) =>
    value
      ? +now - +new Date(value) <= RECOVERY_TARGETS.rpoHours * 3600000 &&
        +new Date(value) <= +now
      : null;
  return {
    targets: RECOVERY_TARGETS,
    status: evidence ? ("admin_reported" as const) : ("unverified" as const),
    productionRestoreVerified: false as const,
    providerRetentionVerified: false as const,
    databaseBackupWithinTarget: fresh(evidence?.databaseBackupAt),
    fileBackupWithinTarget: fresh(evidence?.fileBackupAt),
    drillWithinTarget:
      evidence?.drillCompletedAt &&
      evidence.restoreMinutes !== null &&
      evidence.dataLossMinutes !== null
        ? evidence.restoreMinutes <= 240 && evidence.dataLossMinutes <= 1440
        : null,
  };
}
