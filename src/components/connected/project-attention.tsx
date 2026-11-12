"use client";
import Link from "next/link";
import { useURLState } from "./url-state";
import { useConnectedData } from "./data";
import type { projectAttention } from "@/lib/board-room/attention";
export function ProjectAttention({
  tab,
  attention = "",
}: {
  tab: "attention" | "reviews" | "regions";
  attention?: string;
}) {
  const [scope] = useURLState("qualityScope", "");
  const [page, setPage] = useURLState(tab + "Page", 1);
  const r = useConnectedData<Awaited<ReturnType<typeof projectAttention>>>(
    `/api/board-room/attention?tab=${tab}&page=${page}&attention=${encodeURIComponent(attention)}${scope ? "&overview=" + encodeURIComponent(scope) : ""}`,
  );
  return (
    <section className="connected-panel" aria-busy={r.busy}>
      <h2>
        {tab === "attention"
          ? "Project attention"
          : tab === "reviews"
            ? "Document reviews"
            : "Regional locations to review"}
      </h2>
      <p>
        {tab === "reviews"
          ? "Uploading files never automatically makes a project valid."
          : tab === "regions"
            ? "Choose a verified province in the project editor. Unknown cities and ambiguous names are never assigned automatically."
            : "One row per project. All applicable reasons remain visible; progress reviews follow the existing 30-day policy."}
      </p>
      {attention && (
        <Link href="/board-room?section=quality&qualityTab=attention">
          Show all attention reasons
        </Link>
      )}
      {r.error && (
        <p role="alert">
          {r.error} <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.busy && !r.data && <p role="status">Checking projects…</p>}
      {r.data && (
        <>
          <p>
            Checked {new Date(r.data.checkedAt).toLocaleString()} ·{" "}
            {r.data.total} projects
          </p>
          <ul className="connected-issues">
            {r.data.projects.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                {tab === "attention" ? (
                  <ul>
                    {p.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : tab === "reviews" ? (
                  <p>{p.files} current files · Needs review</p>
                ) : (
                  <p>
                    Recorded location: {p.location || "Not set"} ·{" "}
                    {p.region === "missing"
                      ? "Missing province"
                      : "Unrecognized location"}
                  </p>
                )}
                <Link
                  href={`/board-room/projects/${p.id}?projectTab=${tab === "reviews" ? "documents" : "overview"}`}
                >
                  {tab === "regions"
                    ? "Open project to correct location"
                    : tab === "reviews"
                      ? "Review project evidence"
                      : "Open project"}
                </Link>
              </li>
            ))}
          </ul>
          {!r.data.projects.length && (
            <p>
              {r.data.total
                ? "This page is empty. Return to the first page."
                : "No projects need attention in this scope."}
            </p>
          )}
          <nav
            className="connected-actions"
            aria-label="Project attention pages"
          >
            <button
              disabled={page === 1 || r.busy}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} · {r.data.total} total
            </span>
            <button
              disabled={page * 50 >= r.data.total || r.busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            {!r.data.projects.length && page > 1 && (
              <button onClick={() => setPage(1)}>First page</button>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
