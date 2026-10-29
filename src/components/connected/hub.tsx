"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useConnectedData, connectedRequest, changed } from "./data";
import { ProjectPin } from "./personal";
import { TaskEditor } from "../task-editor";
import type { WorkspaceData } from "@/lib/types";
import type { projectHub } from "@/lib/connected/workspace";
type HubData = Awaited<ReturnType<typeof projectHub>>;
export type HubTab =
  | "overview"
  | "assets"
  | "costs"
  | "tasks"
  | "documents"
  | "storyline"
  | "activity";
export function ProjectHub({
  id,
  tab,
  onTab,
  showTasks = true,
}: {
  showTasks?: boolean;
  id: string;
  tab: HubTab;
  onTab: (tab: HubTab) => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const reveal = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const bounds = nav.getBoundingClientRect(),
        selected = active.getBoundingClientRect();
      if (selected.left < bounds.left)
        nav.scrollLeft += selected.left - bounds.left;
      else if (selected.right > bounds.right)
        nav.scrollLeft += selected.right - bounds.right;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [id, tab]);
  const r = useConnectedData<HubData>(
      "/api/board-room/hub?id=" + id + (showTasks ? "" : "&tasks=0"),
    ),
    [editing, setEditing] = useState(false),
    [taskData, setTaskData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [copyState, setCopyState] = useState<
      "idle" | "copying" | "copied" | "failed"
    >("idle");
  async function copyId() {
    setCopyState("copying");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(id);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  async function create() {
    try {
      const d = await connectedRequest<WorkspaceData>("/api/workspace");
      setTaskData(d);
      setEditing(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="connected-hub">
      <div className="connected-actions">
        <ProjectPin id={id} />
        <span className="br-note">Project ID: {id}</span>
        <button
          disabled={copyState === "copying"}
          onClick={() => void copyId()}
        >
          Copy ID
        </button>
        {showTasks && (
          <button
            disabled={!r.data?.canonicalProjects}
            onClick={() => void create()}
          >
            Add project task
          </button>
        )}
        <Link href={"/board-room/projects/" + id}>Full project page</Link>
      </div>
      {copyState === "copied" && <p role="status">Project ID copied.</p>}
      {copyState === "failed" && (
        <div>
          <p role="alert">
            Copy failed. Select the project ID below and copy it manually.
          </p>
          <label>
            Project ID to copy
            <input
              readOnly
              value={id}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        </div>
      )}
      {showTasks && !r.data?.canonicalProjects && r.data && (
        <p className="br-note">
          Project task creation becomes available after the verified Locker Room
          transition.
        </p>
      )}
      <nav
        ref={navigation}
        className="connected-tabs"
        aria-label="Project sections"
      >
        {(
          [
            "overview",
            "assets",
            "costs",
            "tasks",
            "documents",
            "storyline",
            "activity",
          ] as HubTab[]
        )
          .filter((t) => showTasks || t !== "tasks")
          .map((t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => onTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
      </nav>
      {(error || r.error) && (
        <p role="alert">
          {error || r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.busy && !r.data && <p role="status">Loading project summary…</p>}
      {r.data && (
        <>
          {showTasks && tab === "overview" && (
            <div className="connected-summary">
              {Object.entries(r.data.counts).map(([k, v]) => (
                <button key={k} onClick={() => onTab("tasks")}>
                  <strong>{v}</strong>
                  <span>
                    {k === "blocked"
                      ? "Tasks with unresolved dependencies"
                      : k === "overdue"
                        ? "Tasks past their due date"
                        : k + " tasks"}
                  </span>
                </button>
              ))}
              <p>
                Task completion describes work items, not physical project
                completion.
              </p>
            </div>
          )}
          {tab === "overview" && (
            <div className="connected-actions connected-overview-links">
              <button onClick={() => onTab("assets")}>
                {r.data.assetCount} linked assets
              </button>
              <button onClick={() => onTab("documents")}>
                {r.data.documentCount} current documents ·{" "}
                {r.data.documentValid ? "Valid" : "Not validated"}
              </button>
              <button onClick={() => onTab("activity")}>
                Recent changes
                {r.data.activity[0]
                  ? ` · ${new Date(String(r.data.activity[0].at)).toLocaleDateString("en-GB", { timeZone: r.data.timeZone })}`
                  : " · None recorded"}
              </button>
            </div>
          )}
          {tab === "assets" && (
            <>
              <p>
                Asset totals stay separate from independently entered project
                figures.
              </p>
              <div className="connected-actions">
                {r.data.assetTotals.map((t, i) => (
                  <span key={i}>
                    {String(t.capacity)} {String(t.unit)} · {String(t.count)}{" "}
                    assets
                  </span>
                ))}
              </div>
              <p>
                Showing {r.data.assets.length.toLocaleString("en-US")} of{" "}
                {r.data.assetCount.toLocaleString("en-US")} linked assets.
              </p>
              <ul className="connected-issues">
                {r.data.assets.map((a) => (
                  <li key={String(a.id)}>
                    <Link href={"/board-room?section=assets&asset=" + a.id}>
                      {String(a.code)} —{" "}
                      {String((a.data as Record<string, unknown>).name)}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={"/board-room?section=assets&assetProject=" + id}>
                View all project assets
              </Link>
            </>
          )}
          {showTasks && tab === "tasks" && (
            <>
              <Link href={"/app?section=project&project=" + id}>
                Open project in Locker Room
              </Link>
              <p>
                Showing {r.data.tasks.length.toLocaleString("en-US")} of{" "}
                {r.data.counts.total.toLocaleString("en-US")} project tasks.
              </p>
              <ul className="connected-issues">
                {r.data.tasks.map((t) => (
                  <li key={String(t.id)}>
                    <Link href={"/app?section=tasks&task=" + t.id}>
                      {String(t.title)}
                    </Link>
                    <p>
                      {String(t.status)} · {String(t.assignee || "Unassigned")}{" "}
                      · {String(t.due_date || "No due date")}
                    </p>
                  </li>
                ))}
              </ul>
              {r.data.tasks.length === 0 && <p>No project tasks yet.</p>}
            </>
          )}
          {tab === "activity" && (
            <ul className="connected-issues">
              {r.data.activity.map((a) => (
                <li key={String(a.id)}>
                  <strong>{String(a.kind).replaceAll("_", " ")}</strong>
                  <p>
                    {String(
                      (a.detail as Record<string, unknown>)?.message ??
                        (a.detail as Record<string, unknown>)?.note ??
                        "Project record updated",
                    )}
                  </p>
                  <time>{new Date(String(a.at)).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && taskData && (
        <TaskEditor
          task={null}
          defaults={{ projectId: id }}
          data={taskData}
          demo={false}
          onClose={() => setEditing(false)}
          run={async (command) => {
            const result = await connectedRequest("/api/workspace", command);
            changed();
            r.retry();
            return result as Awaited<
              ReturnType<import("../workspace-types").RunCommand>
            >;
          }}
        />
      )}
    </section>
  );
}
