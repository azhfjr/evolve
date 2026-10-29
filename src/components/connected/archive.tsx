"use client";
import { useState } from "react";
import Link from "next/link";
import { useConnectedData } from "./data";
export function LegacyArchive({
  initialKind = "project",
  id,
}: {
  initialKind?: "project" | "task";
  id?: string;
}) {
  const [kind, setKind] = useState(initialKind),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [childrenPage, setChildrenPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1);
  const r = useConnectedData<{
    items?: { id: string; name?: string; title?: string }[];
    total?: number;
    record?: Record<string, unknown>;
    files?: { id: string; filename: string; size: number }[];
    children?: { id: string; name: string }[];
    childrenTotal?: number;
    historyTotal?: number;
    history?: { id: string; kind: string; data: Record<string, unknown> }[];
  }>(
    "/api/workspace/archive?" +
      new URLSearchParams(
        id
          ? {
              kind,
              id,
              childrenPage: String(childrenPage),
              historyPage: String(historyPage),
            }
          : { kind, q, page: String(page) },
      ),
  );
  return (
    <section className="connected-panel">
      <h1>Legacy Locker archive</h1>
      <p>
        Read-only historical work. Existing external Calendar events remain;
        archived work no longer syncs or generates recurring tasks.
      </p>
      <Link href="/workspace">Back to Evolve</Link>
      {!id && (
        <>
          <div className="connected-actions">
            <button
              aria-pressed={kind === "project"}
              onClick={() => {
                setKind("project");
                setPage(1);
              }}
            >
              Projects
            </button>
            <button
              aria-pressed={kind === "task"}
              onClick={() => {
                setKind("task");
                setPage(1);
              }}
            >
              Tasks
            </button>
          </div>
          <input
            aria-label="Search legacy archive"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </>
      )}
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.busy && !r.data && <p role="status">Loading archive…</p>}
      <ul className="connected-issues">
        {r.data?.items?.map((i) => (
          <li key={i.id}>
            <Link href={"/workspace/archive?kind=" + kind + "&id=" + i.id}>
              {i.name || i.title}
            </Link>
          </li>
        ))}
      </ul>
      {r.data?.record && (
        <>
          <h2>{String(r.data.record.name ?? r.data.record.title)}</h2>
          <dl>
            {Object.entries(r.data.record)
              .filter(([k]) =>
                [
                  "description",
                  "status",
                  "reference",
                  "location",
                  "due_date",
                  "assignee",
                  "budget",
                  "currency",
                ].includes(k),
              )
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{String(v ?? "—")}</dd>
                </div>
              ))}
          </dl>
          <h3>Documents</h3>
          <ul>
            {r.data.files?.map((f) => (
              <li key={f.id}>
                <a
                  href={"/api/attachments/" + f.id + "/content"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {f.filename}
                </a>
              </li>
            ))}
          </ul>
          <h3>{kind === "project" ? "Historical tasks" : "Comments"}</h3>
          <ul>
            {r.data.children?.map((c) => (
              <li key={c.id}>
                {kind === "project" ? (
                  <Link href={"/workspace/archive?kind=task&id=" + c.id}>
                    {c.name}
                  </Link>
                ) : (
                  c.name
                )}
              </li>
            ))}
          </ul>
          <div className="connected-actions">
            <button
              disabled={childrenPage === 1}
              onClick={() => setChildrenPage((p) => p - 1)}
            >
              Previous {kind === "project" ? "tasks" : "comments"}
            </button>
            <span>{r.data.childrenTotal} records</span>
            <button
              disabled={childrenPage * 50 >= (r.data.childrenTotal ?? 0)}
              onClick={() => setChildrenPage((p) => p + 1)}
            >
              More {kind === "project" ? "tasks" : "comments"}
            </button>
          </div>
          <h3>Historical activity and expenses</h3>
          <ul className="connected-issues">
            {r.data.history?.map((h) => (
              <li key={h.id}>
                <strong>
                  {h.kind === "project_expense"
                    ? String(h.data.description ?? "Expense")
                    : String(h.data.message ?? "Activity")}
                </strong>
                <p>
                  {h.kind === "project_expense"
                    ? `${h.data.currency} ${h.data.amount} · ${h.data.booked_on}${h.data.voided ? " · Voided" : ""}`
                    : String(h.data.actor ?? "")}
                </p>
                <small>{String(h.data.created_at ?? "")}</small>
              </li>
            ))}
          </ul>
          {r.data.historyTotal === 0 && (
            <p>No recorded historical activity or expenses.</p>
          )}
          <div className="connected-actions">
            <button
              disabled={historyPage === 1}
              onClick={() => setHistoryPage((p) => p - 1)}
            >
              Previous history
            </button>
            <span>{r.data.historyTotal} records</span>
            <button
              disabled={historyPage * 50 >= (r.data.historyTotal ?? 0)}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              More history
            </button>
          </div>
        </>
      )}
      {!id && (
        <div className="connected-actions">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>{r.data?.total ?? "…"} records</span>
          <button
            disabled={page * 50 >= (r.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
