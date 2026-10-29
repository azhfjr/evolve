"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationsReport } from "@/lib/operations";
import type { RecoveryEvidence } from "@/lib/operations-model";
import {
  formatFileSize,
  WORKSPACE_FILE_LIMIT,
} from "@/lib/file-management-model";
import "./operations-panel.css";
type Draft = {
  databaseBackupAt: string;
  fileBackupAt: string;
  drillCompletedAt: string;
  restoreMinutes: string;
  dataLossMinutes: string;
  reference: string;
};
function localDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function draftFrom(evidence?: RecoveryEvidence): Draft {
  return {
    databaseBackupAt: localDate(evidence?.databaseBackupAt),
    fileBackupAt: localDate(evidence?.fileBackupAt),
    drillCompletedAt: localDate(evidence?.drillCompletedAt),
    restoreMinutes: evidence?.restoreMinutes?.toString() || "",
    dataLossMinutes: evidence?.dataLossMinutes?.toString() || "",
    reference: evidence?.reference || "",
  };
}
function stamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not observed";
}
function assessment(value: boolean | null) {
  return value === null
    ? "Unknown"
    : value
      ? "Reported within target"
      : "Reported outside target";
}
async function requestOperations(
  signal?: AbortSignal,
): Promise<OperationsReport> {
  const response = await fetch("/api/operations", {
    cache: "no-store",
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Operations could not be loaded.");
  return result;
}
export function OperationsPanel() {
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom());
  const [busy, setBusy] = useState("refresh");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await requestOperations(signal);
      if (signal?.aborted) return;
      setReport(result);
      if (!initialized.current) {
        setDraft(draftFrom(result.state.evidence));
        initialized.current = true;
      }
    } catch (failure) {
      if (!signal?.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Operations could not be loaded.",
        );
    } finally {
      if (!signal?.aborted) setBusy("");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    requestOperations(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setReport(result);
        setDraft(draftFrom(result.state.evidence));
        initialized.current = true;
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Operations could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy("");
      });
    return () => controller.abort();
  }, []);
  function refresh() {
    setBusy("refresh");
    setError("");
    setNotice("");
    void load();
  }
  async function command(action: "runCheck" | "acknowledge" | "saveEvidence") {
    if (!report || busy) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const evidence =
        action === "saveEvidence"
          ? {
              databaseBackupAt: draft.databaseBackupAt
                ? new Date(draft.databaseBackupAt).toISOString()
                : null,
              fileBackupAt: draft.fileBackupAt
                ? new Date(draft.fileBackupAt).toISOString()
                : null,
              drillCompletedAt: draft.drillCompletedAt
                ? new Date(draft.drillCompletedAt).toISOString()
                : null,
              restoreMinutes:
                draft.restoreMinutes === ""
                  ? null
                  : Number(draft.restoreMinutes),
              dataLossMinutes:
                draft.dataLossMinutes === ""
                  ? null
                  : Number(draft.dataLossMinutes),
              reference: draft.reference,
            }
          : undefined;
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          version: report.version,
          ...(evidence ? { evidence } : {}),
          ...(action === "acknowledge"
            ? { fingerprint: report.fingerprint }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Operations could not be updated.");
      setReport(result);
      if (action === "saveEvidence") setDraft(draftFrom(result.state.evidence));
      setNotice(
        action === "saveEvidence"
          ? "Admin-reported recovery evidence saved."
          : action === "acknowledge"
            ? "Incident acknowledged. Active conditions remain visible."
            : "Current database and background-work signals checked.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Operations could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }
  function field(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  return (
    <section className="operations-panel" aria-label="Operations readiness">
      <div className="operations-boundary">
        <strong>Dashboard monitoring only</strong>
        <p>
          This dashboard cannot detect a full-site outage while Evolve is
          unavailable. Independent external uptime monitoring is not configured.
          No email or webhook alerts are sent.
        </p>
      </div>
      <div className="operations-toolbar">
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={refresh}
        >
          Refresh status
        </button>
        <button
          className="button"
          disabled={!report || !!busy}
          onClick={() => void command("runCheck")}
        >
          {busy === "runCheck" ? "Checking…" : "Run check"}
        </button>
        <span>Read-only checks; no cleanup, backup or restore is started.</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error} Use Refresh status to load the latest version; recovery drafts
          are preserved.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!report && !error && <p role="status">Loading operations…</p>}
      {report && (
        <>
          {report.connected && (
            <section className="operations-card">
              <h2>Connected workspace</h2>
              <p>
                {report.connected.status.enabled
                  ? "Canonical projects active"
                  : "Transition not activated"}{" "}
                · {String(report.connected.status.archivedRecords)} archived
                records · {String(report.connected.status.importFindings)}{" "}
                unresolved import findings
              </p>
              {Number(report.connected.status.danglingAssets) +
                Number(report.connected.status.orphanTasks) >
                0 && (
                <p role="alert">
                  Project relationships need investigation. Open the data
                  quality workbench before further updates.
                </p>
              )}
              <h3>API performance · last 15 minutes</h3>
              <p>
                p95 values are histogram upper bounds. Expected validation and
                permission rejections are not server failures.
              </p>
              {report.connected.requests.length ? (
                <div className="connected-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Operation</th>
                        <th>Requests</th>
                        <th>Server errors</th>
                        <th>p95 bound</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.connected.requests.map((row) => (
                        <tr key={row.route}>
                          <td>{row.route}</td>
                          <td>{row.requests}</td>
                          <td>{row.errors}</td>
                          <td>{row.p95}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No recorded requests yet.</p>
              )}
            </section>
          )}
          <section className="operations-card">
            <h2>Current conditions</h2>
            <p>
              Observed {stamp(report.observedAt)} · Last manual check:{" "}
              {stamp(report.state.checkedAt)}
            </p>
            {report.signals.length ? (
              <>
                <ul className="operations-signals">
                  {report.signals.map((signal) => (
                    <li key={signal.code} data-severity={signal.severity}>
                      <strong>
                        {signal.severity === "critical"
                          ? "Critical"
                          : "Attention"}
                      </strong>
                      <span>{signal.message}</span>
                    </li>
                  ))}
                </ul>
                <p>
                  {report.acknowledged
                    ? `Acknowledged ${stamp(report.state.acknowledgment?.at)} by ${report.state.acknowledgment?.by}. Conditions remain active.`
                    : "These conditions have not been acknowledged."}
                </p>
                <button
                  className="button secondary"
                  disabled={!!busy || report.acknowledged}
                  onClick={() => void command("acknowledge")}
                >
                  {report.acknowledged
                    ? "Acknowledged"
                    : "Acknowledge current incident"}
                </button>
              </>
            ) : (
              <p>
                No monitored conditions currently require attention. This is not
                an availability or recovery guarantee.
              </p>
            )}
          </section>
          <div className="operations-grid">
            <section className="operations-card">
              <h2>Daily maintenance</h2>
              <dl>
                <dt>Scheduler authentication</dt>
                <dd>
                  {report.maintenanceAuthenticationConfigured
                    ? "Configured — server-side secret present"
                    : "Not configured — requires a server-side secret of at least 32 characters"}
                </dd>
                <dt>Schedule</dt>
                <dd>02:00 UTC daily</dd>
                <dt>Overdue threshold</dt>
                <dd>36 hours since completion (12 hours grace)</dd>
                <dt>Last started</dt>
                <dd>{stamp(report.state.maintenance?.startedAt)}</dd>
                <dt>Last completed</dt>
                <dd>{stamp(report.state.maintenance?.completedAt)}</dd>
                <dt>Last failed</dt>
                <dd>{stamp(report.state.maintenance?.failedAt)}</dd>
              </dl>
              <p>
                Completion confirms the handler finished. Cleanup and Calendar
                failures can remain in their backlogs. A missed heartbeat can be
                reviewed here when the application is available.
              </p>
            </section>
            <section className="operations-card">
              <h2>Storage and background work</h2>
              <dl>
                <dt>Shared document allocation</dt>
                <dd>
                  {formatFileSize(report.metrics.storageBytes)} /{" "}
                  {formatFileSize(WORKSPACE_FILE_LIMIT)}
                </dd>
                <dt>Calendar jobs pending (all accounts)</dt>
                <dd>{report.metrics.calendarPending}</dd>
                <dt>Calendar jobs with recorded errors</dt>
                <dd>{report.metrics.calendarFailed}</dd>
                <dt>Eligible Calendar work due over 24 hours</dt>
                <dd>{report.metrics.calendarOverdue}</dd>
                <dt>Expired cleanup reservations</dt>
                <dd>{report.metrics.cleanupOverdue}</dd>
              </dl>
              <p>
                Storage includes pending and deleting reservations within the
                existing shared 1 GB allocation. Queue errors can be retrying or
                require account reconnection.
              </p>
            </section>
          </div>
          <section className="operations-card">
            <h2>Recovery readiness</h2>
            <p>
              <strong>
                Targets: data-loss window (RPO) ≤24 hours; time to restore (RTO)
                ≤4 hours.
              </strong>
            </p>
            <p>
              Production recovery is unverified. Provider retention and actual
              private Blob restoration are unverified. Entries below are
              admin-reported evidence, not provider verification, a backup
              service or proof of a successful production restore.
            </p>
            <dl>
              <dt>Evidence status</dt>
              <dd>
                {report.recovery.status === "unverified"
                  ? "Unverified — no evidence recorded"
                  : "Admin-reported; independently unverified"}
              </dd>
              <dt>Database backup age</dt>
              <dd>{assessment(report.recovery.databaseBackupWithinTarget)}</dd>
              <dt>Private-file backup age</dt>
              <dd>{assessment(report.recovery.fileBackupWithinTarget)}</dd>
              <dt>Reported drill measurements</dt>
              <dd>{assessment(report.recovery.drillWithinTarget)}</dd>
            </dl>
            {report.state.evidence && (
              <p>
                Last recorded {stamp(report.state.evidence.recordedAt)} by{" "}
                {report.state.evidence.recordedBy}. Reference:{" "}
                {report.state.evidence.reference}
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void command("saveEvidence");
              }}
            >
              <h3>Record recovery evidence</h3>
              <p>
                Use timestamps from actual backup or separate-environment drill
                records. Leave unknown fields empty. References should identify
                the record without credentials, private file links or document
                contents. Times use your device timezone.
              </p>
              <fieldset
                className="operations-evidence-fields"
                aria-label="Recovery evidence fields"
                disabled={busy === "saveEvidence"}
              >
                <div className="operations-form-grid">
                  {(
                    [
                      ["databaseBackupAt", "Database backup timestamp"],
                      ["fileBackupAt", "Private-file backup timestamp"],
                      ["drillCompletedAt", "Recovery drill completed"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="datetime-local"
                        value={draft[key]}
                        onChange={(event) => field(key, event.target.value)}
                      />
                    </label>
                  ))}
                  <label>
                    Observed time to restore (minutes)
                    <input
                      type="number"
                      min="0"
                      max="525600"
                      step="1"
                      value={draft.restoreMinutes}
                      onChange={(event) =>
                        field("restoreMinutes", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Observed data-loss window (minutes)
                    <input
                      type="number"
                      min="0"
                      max="525600"
                      step="1"
                      value={draft.dataLossMinutes}
                      onChange={(event) =>
                        field("dataLossMinutes", event.target.value)
                      }
                    />
                  </label>
                  <label className="operations-reference">
                    Evidence reference / scope
                    <textarea
                      required
                      maxLength={500}
                      value={draft.reference}
                      onChange={(event) =>
                        field("reference", event.target.value)
                      }
                    />
                  </label>
                </div>
              </fieldset>
              <button className="button" type="submit" disabled={!!busy}>
                {busy === "saveEvidence" ? "Saving…" : "Save reported evidence"}
              </button>
            </form>
          </section>
        </>
      )}
    </section>
  );
}
