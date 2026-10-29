"use client";
import "@/app/board-evidence.css";
import { useEffect, useState } from "react";
import type { ImportBatch } from "@/lib/board-room/import-history";
export function ImportHistory({ revision = 0 }: { revision?: number }) {
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/board-room/imports", {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw Error(body.error || "Import history could not be loaded.");
        setBatches(body.batches);
        setError("");
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [revision, refreshTick]);
  return (
    <section className="br-evidence-panel" aria-label="CSV import history">
      <div className="br-evidence-heading">
        <div>
          <h2>Import history</h2>
          <p className="br-note">
            The latest 25 recorded imports. This activity journal can be cleared
            by an admin; it is not a protected audit log.
          </p>
        </div>
        <button onClick={() => setRefreshTick((r) => r + 1)}>
          Refresh history
        </button>
      </div>
      {error && (
        <p role="alert" className="br-error">
          {error}
        </p>
      )}
      {!batches && !error && <p role="status">Loading import history…</p>}
      {batches?.length === 0 && <p>No CSV imports recorded yet.</p>}
      {!!batches?.length && (
        <div className="br-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Imported</th>
                <th>Admin</th>
                <th>Result</th>
                <th>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={`${batch.id}:${batch.actor}`}>
                  <td>{new Date(batch.createdAt).toLocaleString("en-GB")}</td>
                  <td>{batch.actor}</td>
                  <td>
                    {batch.counts
                      ? `${batch.counts.new} new · ${batch.counts.updated} updated · ${batch.counts.unchanged} unchanged (${batch.totalRows} rows)`
                      : `${batch.recordedProjects} project record · legacy import; batch totals unavailable`}
                  </td>
                  <td>
                    {batch.legacy
                      ? "Not recorded"
                      : batch.updateStages
                        ? "CSV stage updates allowed"
                        : "Existing stages preserved"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="br-note">
        Preview every new import before merging. Keep an exported copy before
        major edits; automatic batch rollback is not available.
      </p>
    </section>
  );
}
