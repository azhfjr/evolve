"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useURLState } from "./url-state";
import { useConnectedData, connectedRequest } from "./data";
type ActionData = {
  pagination?: Record<
    "tasks" | "notifications" | "review",
    { page: number; limit: number; total: number }
  >;
  tasks: {
    id: string;
    title: string;
    projectName: string;
    dueDate: string | null;
    overdue: boolean;
  }[];
  notifications: {
    id: string;
    taskId: string | null;
    message: string;
    read: boolean;
  }[];
  review: { id: string; name: string }[];
};
export function PersonalActions() {
  const [filter, setFilter] = useURLState("actionView", "tasks", (v) =>
    ["tasks", "notifications", "document reviews"].includes(String(v)),
  );
  const [tasksPage, setTasksPage] = useURLState("tasksPage", 1),
    [notificationsPage, setNotificationsPage] = useURLState(
      "notificationsPage",
      1,
    ),
    [reviewsPage, setReviewsPage] = useURLState("reviewsPage", 1);
  const pending = useRef(new Set<string>());
  const [states, setStates] = useState<
    Record<
      string,
      {
        pending: boolean;
        error: string;
        done: boolean;
        source?: ActionData | null;
      }
    >
  >({});
  async function markRead(id: string) {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setStates((s) => ({
      ...s,
      [id]: { pending: true, error: "", done: false },
    }));
    try {
      await connectedRequest("/api/workspace", {
        action: "readNotification",
        id,
        read: true,
      });
      setStates((s) => ({
        ...s,
        [id]: { pending: false, error: "", done: true, source: r.data },
      }));
      r.retry();
    } catch (e) {
      setStates((s) => ({
        ...s,
        [id]: { pending: false, error: (e as Error).message, done: false },
      }));
    } finally {
      pending.current.delete(id);
    }
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    tasksPage,
    notificationsPage,
    reviewsPage,
  }))
    if (value > 1) params.set(key, String(value));
  const r = useConnectedData<ActionData>(
    "/api/workspace/actions" + (params.size ? "?" + params : ""),
  );
  const kind =
    filter === "document reviews"
      ? "review"
      : (filter as "tasks" | "notifications");
  const meta = r.data?.pagination?.[kind];
  const activePage =
    kind === "tasks"
      ? tasksPage
      : kind === "notifications"
        ? notificationsPage
        : reviewsPage;
  const setPage =
    kind === "tasks"
      ? setTasksPage
      : kind === "notifications"
        ? setNotificationsPage
        : setReviewsPage;
  const count = r.data?.[kind].length ?? 0;
  const changing = r.busy || Boolean(meta && meta.page !== activePage);
  return (
    <section className="connected-panel">
      <div className="connected-heading">
        <h2>Your action centre</h2>
      </div>
      <div className="connected-actions">
        {["tasks", "notifications", "document reviews"].map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.busy && !r.data && <p role="status">Loading your work…</p>}
      <ul className="connected-issues">
        {filter === "tasks" &&
          r.data?.tasks.map((t) => (
            <li key={t.id}>
              <Link href={"/app?section=tasks&task=" + t.id}>{t.title}</Link>
              <p>
                {t.projectName} · Assigned to you
                {t.overdue ? " · Past due" : ""}
                {t.dueDate ? " · " + t.dueDate : ""}
              </p>
            </li>
          ))}
        {filter === "notifications" &&
          r.data?.notifications.map((n) => (
            <li key={n.id}>
              {n.taskId ? (
                <Link href={"/app?section=tasks&task=" + n.taskId}>
                  {n.message}
                </Link>
              ) : (
                n.message
              )}
              {!n.read &&
                !(states[n.id]?.done && states[n.id]?.source === r.data) && (
                  <button
                    disabled={states[n.id]?.pending}
                    onClick={() => void markRead(n.id)}
                  >
                    {states[n.id]?.pending ? "Marking read…" : "Mark read"}
                  </button>
                )}
              {states[n.id]?.pending && (
                <span role="status">Saving notification…</span>
              )}
              {states[n.id]?.done &&
                (n.read || states[n.id]?.source === r.data) && (
                  <span role="status">Notification marked read.</span>
                )}
              {states[n.id]?.error && (
                <div role="alert" className="connected-action-error">
                  <p>{states[n.id].error}</p>
                  <button onClick={() => void markRead(n.id)}>
                    Retry mark read
                  </button>
                </div>
              )}
            </li>
          ))}
        {filter === "document reviews" &&
          r.data?.review.map((p) => (
            <li key={p.id}>
              <Link href={"/board-room/projects/" + p.id}>{p.name}</Link>
              <p>Ready documents need an administrator’s review.</p>
            </li>
          ))}
      </ul>
      {meta && (
        <nav
          className="connected-actions"
          aria-label="Action centre pages"
          aria-busy={changing}
        >
          <span>
            Showing {count ? (meta.page - 1) * meta.limit + 1 : 0}–
            {count ? (meta.page - 1) * meta.limit + count : 0} of{" "}
            {meta.total.toLocaleString("en-US")}
          </span>
          <button
            disabled={changing || activePage === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous actions
          </button>
          <span>Page {activePage}</span>
          <button
            disabled={changing || activePage * meta.limit >= meta.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next actions
          </button>
          {!count && meta.total > 0 && (
            <button onClick={() => setPage(1)}>
              Return to first actions page
            </button>
          )}
        </nav>
      )}
      {r.data &&
        ((filter === "tasks" && r.data.tasks.length === 0) ||
          (filter === "notifications" && r.data.notifications.length === 0) ||
          (filter === "document reviews" && r.data.review.length === 0)) && (
          <p>No items in this view.</p>
        )}
    </section>
  );
}
