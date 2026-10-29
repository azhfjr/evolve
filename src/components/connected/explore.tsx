"use client";
import { useState } from "react";
import Link from "next/link";
import type { QualityIssue } from "@/lib/assets/explore";
import { connectedRequest, useConnectedData } from "./data";
import { useURLState } from "./url-state";
export function QualityWorkspace() {
  const [actionError, setActionError] = useState("");
  const [page, setPage] = useURLState("qualityPage", 1);
  const r = useConnectedData<{
    issues: QualityIssue[];
    total: number;
    checkedAt: string;
  }>(`/api/board-room/quality?page=${page}`);
  return (
    <section className="connected-panel">
      <h2>Data quality workbench</h2>
      <p>
        Warnings explain differences; they never overwrite project or asset
        figures.
      </p>
      <button onClick={r.retry}>Check again</button>
      {(r.error || actionError) && <p role="alert">{r.error || actionError}</p>}
      {r.busy && <p role="status">Checking records…</p>}
      {r.data && (
        <>
          <p>
            Checked {new Date(r.data.checkedAt).toLocaleString()} ·{" "}
            {r.data.total} findings
          </p>
          <ul className="connected-issues">
            {r.data.issues.map((i) => (
              <li key={i.kind + i.id}>
                <strong>{i.name}</strong>
                <p>{i.reason}</p>
                <Link href={i.href}>Review record</Link>
                {i.kind === "import_conflict" && (
                  <button
                    onClick={async () => {
                      try {
                        await connectedRequest("/api/board-room/assets", {
                          action: "resolveFinding",
                          id: i.id,
                          version: i.version,
                        });
                        r.retry();
                      } catch (e) {
                        setActionError((e as Error).message);
                      }
                    }}
                  >
                    Mark finding resolved
                  </button>
                )}
              </li>
            ))}
          </ul>
          {r.data.total === 0 && <p>No findings in the current checks.</p>}
          <div className="connected-actions">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={page * 100 >= r.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
