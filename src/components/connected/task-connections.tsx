"use client";
import { useState } from "react";
import type { WorkspaceData, Task } from "@/lib/types";
import type { ConnectionEntity } from "@/lib/connection-model";
import { ConnectionTree } from "../connection-tree";
import { ProjectPicker } from "./project-picker";
import { useConnectedData } from "./data";
export function ProjectTaskConnections({
  data,
  onOpen,
}: {
  data: WorkspaceData;
  onOpen: (entity: ConnectionEntity, signal: AbortSignal) => Promise<void>;
}) {
  const [id, setId] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [cursors, setCursors] = useState<string[]>([]),
    [error, setError] = useState("");
  const params = new URLSearchParams({
    projectId: id ?? "00000000-0000-4000-8000-000000000000",
    q,
    limit: "50",
    sort: "title",
  });
  if (cursors.length) params.set("cursor", cursors[cursors.length - 1]);
  const r = useConnectedData<{
    tasks: Task[];
    total: number;
    nextCursor: string | null;
  }>(id ? "/api/tasks?" + params : "");
  const parent = data.projects.find((p) => p.id === id);
  const items: ConnectionEntity[] = (r.data?.tasks ?? []).map((t) => ({
    id: t.id,
    kind: "task",
    projectId: t.projectId,
    title: t.title,
    status: t.status,
    labels: [],
    archived: t.archived,
    version: t.version,
  }));
  return (
    <section className="connected-panel">
      <h2>Project → Task connections</h2>
      <p>
        Shared Board Room projects and their Locker Room work. Asset connections
        remain in Board Room.
      </p>
      <ProjectPicker
        label="Connection project"
        optional={false}
        value={id}
        onChange={(v) => {
          setId(v);
          setCursors([]);
        }}
      />
      <input
        aria-label="Search connected tasks"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursors([]);
        }}
        placeholder="Search task titles…"
      />
      {(r.error || error) && (
        <p role="alert">
          {r.error || error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {id ? (
        <>
          <ConnectionTree
            label={parent?.name ?? "Project"}
            items={items}
            parents={
              parent
                ? [
                    {
                      id: parent.id,
                      kind: "project",
                      projectId: null,
                      title: parent.name,
                      status: parent.status ?? "active",
                      labels: [],
                      archived: false,
                      version: parent.version ?? 1,
                    },
                  ]
                : []
            }
            total={r.data?.total ?? 0}
            busy={r.busy}
            projectRooted
            onEdit={() => {}}
            canEdit={() => false}
            onOpen={(entity) => {
              void onOpen(entity, new AbortController().signal).catch((e) =>
                setError((e as Error).message),
              );
            }}
          />
          <div className="connected-actions">
            <button
              disabled={!cursors.length}
              onClick={() => setCursors((v) => v.slice(0, -1))}
            >
              Previous tasks
            </button>
            <span>{r.data?.total ?? "…"} matching tasks</span>
            <button
              disabled={!r.data?.nextCursor}
              onClick={() => setCursors((v) => [...v, r.data!.nextCursor!])}
            >
              Next tasks
            </button>
          </div>
        </>
      ) : (
        <p>Choose a project to explore its tasks.</p>
      )}
    </section>
  );
}
