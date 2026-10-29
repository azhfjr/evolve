"use client";
import { useState } from "react";
import Link from "next/link";
import { Modal } from "../ui";
import { useConnectedData } from "./data";
import type { SearchResult } from "@/lib/connected/workspace";
export function UnifiedSearch({
  beforeNavigate,
}: {
  beforeNavigate?: (href: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const r = useConnectedData<{ items: SearchResult[]; total: number }>(
    open && q.length >= 2
      ? `/api/workspace/search?q=${encodeURIComponent(q)}&page=${page}`
      : "",
  );
  return (
    <>
      <button
        className="connected-search-button"
        onClick={() => setOpen(true)}
        aria-label="Search Evolve"
      >
        Search Evolve
      </button>
      {open && (
        <Modal open title="Search Evolve" onClose={() => setOpen(false)}>
          <div className="connected-form">
            <input
              autoFocus
              aria-label="Search projects, assets, tasks and documents"
              placeholder="Project, RUPTL code, task or document…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {q.length < 2 ? (
              <p>Enter at least two characters.</p>
            ) : (
              <>
                {r.busy && <p role="status">Searching…</p>}
                {r.error && (
                  <p role="alert">
                    {r.error}
                    <button onClick={r.retry}>Retry</button>
                  </p>
                )}
                <ul className="connected-issues">
                  {r.data?.items.map((i) => (
                    <li key={i.kind + i.id}>
                      <small>{i.kind}</small>
                      <Link
                        href={i.href}
                        onClick={(event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          setOpen(false);
                          if (beforeNavigate) {
                            event.preventDefault();
                            beforeNavigate(i.href);
                          }
                        }}
                      >
                        {i.title}
                      </Link>
                      <p>{i.context}</p>
                    </li>
                  ))}
                </ul>
                {r.data &&
                  r.data.total > 0 &&
                  r.data.items.length === 0 &&
                  !r.busy && (
                    <p>
                      No results on this page.{" "}
                      <button onClick={() => setPage(1)}>
                        Return to first search page
                      </button>
                    </p>
                  )}
                {r.data?.total === 0 && !r.busy && (
                  <p>No matches. Try a project name or RUPTL code.</p>
                )}
                <div className="connected-actions">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>{r.data?.total ?? "…"} results</span>
                  <button
                    disabled={page * 25 >= (r.data?.total ?? 0)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
