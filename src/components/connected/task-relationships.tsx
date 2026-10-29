"use client";
import { useState } from "react";
import type { TaskDraft } from "@/lib/task-composer";
import type { Task, WorkspaceData } from "@/lib/types";
import { useConnectedData } from "./data";
export function TaskRelationships({
  draft,
  update,
  data,
  taskId,
}: {
  draft: TaskDraft;
  update: (patch: Partial<TaskDraft>) => void;
  data: WorkspaceData;
  taskId?: string;
}) {
  const [kind, setKind] = useState<"parent" | "dependencies">("parent"),
    [q, setQ] = useState(""),
    [cursors, setCursors] = useState<string[]>([]),
    [open, setOpen] = useState(false);
  const p = new URLSearchParams({
    q,
    limit: "25",
    archived: "false",
    sort: "title",
  });
  if (kind === "parent" && draft.projectId) p.set("projectId", draft.projectId);
  if (cursors.length) p.set("cursor", cursors[cursors.length - 1]);
  const r = useConnectedData<{ tasks: Task[]; nextCursor: string | null }>(
    open ? "/api/tasks?" + p : "",
  );
  const dependencies = draft.dependencies ?? [];
  function name(id: string) {
    return (
      data.tasks.find((t) => t.id === id)?.title ??
      r.data?.tasks.find((t) => t.id === id)?.title ??
      id
    );
  }
  return (
    <section className="task-planning">
      <h3>Task relationships</h3>
      <p>
        Subtasks inherit their parent’s project. Unfinished prerequisites and
        subtasks block completion.
      </p>
      <div className="connected-actions">
        <button
          type="button"
          aria-expanded={open && kind === "parent"}
          disabled={!draft.projectId}
          onClick={() => {
            setKind("parent");
            setOpen(true);
            setCursors([]);
            setQ("");
          }}
        >
          Choose parent task
        </button>
        <button
          type="button"
          aria-expanded={open && kind === "dependencies"}
          onClick={() => {
            setKind("dependencies");
            setOpen(true);
            setCursors([]);
            setQ("");
          }}
        >
          Choose prerequisites
        </button>
      </div>
      {draft.parentId && (
        <p>
          Parent: {name(draft.parentId)}{" "}
          <button type="button" onClick={() => update({ parentId: null })}>
            Remove parent
          </button>
        </p>
      )}
      {dependencies.map((id) => (
        <p key={id}>
          Requires: {name(id)}{" "}
          <button
            type="button"
            onClick={() =>
              update({ dependencies: dependencies.filter((x) => x !== id) })
            }
          >
            Remove prerequisite
          </button>
        </p>
      ))}
      {open && (
        <div
          className="connected-picker-menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="connected-heading">
            <strong>
              {kind === "parent" ? "Parent task" : "Prerequisites"}
            </strong>
            <button type="button" onClick={() => setOpen(false)}>
              Close choices
            </button>
          </div>
          <input
            aria-label="Search related tasks"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursors([]);
            }}
            placeholder="Search tasks…"
          />
          {r.error && (
            <p role="alert">
              {r.error}
              <button type="button" onClick={r.retry}>
                Retry
              </button>
            </p>
          )}
          {r.busy && <p role="status">Loading tasks…</p>}
          {r.data?.tasks
            .filter((t) => t.id !== taskId)
            .map((t) => (
              <button
                type="button"
                key={t.id}
                aria-pressed={
                  kind === "parent"
                    ? draft.parentId === t.id
                    : dependencies.includes(t.id)
                }
                onClick={() => {
                  if (kind === "parent") {
                    update({ parentId: t.id, projectId: t.projectId });
                    setOpen(false);
                  } else
                    update({
                      dependencies: dependencies.includes(t.id)
                        ? dependencies.filter((id) => id !== t.id)
                        : [...dependencies, t.id],
                    });
                }}
              >
                {t.title}
                <small>
                  {data.projects.find((p) => p.id === t.projectId)?.name} ·{" "}
                  {t.status}
                </small>
              </button>
            ))}
          <div className="connected-actions">
            <button
              type="button"
              disabled={!cursors.length}
              onClick={() => setCursors((v) => v.slice(0, -1))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!r.data?.nextCursor}
              onClick={() => setCursors((v) => [...v, r.data!.nextCursor!])}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
