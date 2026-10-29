"use client";
import { useEffect, useState } from "react";
import { AccountSettings } from "./account-settings";
import { RoomTemplates } from "./room-templates";
import { ActivityManagement, PeopleManagement } from "./management";
import { EditMemberDialog } from "./account-settings";
import { InviteDialog } from "./project-dialog";
import { Spinner } from "./ui";
import type { WorkspaceData, Member } from "@/lib/types";
import type { RunCommand, SharedProps } from "./workspace-types";
export default function WorkspaceManagementPanel({
  section,
  onChanged,
  onProject,
  onNavigate,
  onLogout,
  experience,
}: {
  experience: Pick<WorkspaceData, "profile" | "settings">;
  onProject: (id: string) => void;
  onNavigate: (section: string) => void;
  onLogout: () => void;
  section: "people" | "activity" | "files" | "preferences" | "templates";
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [editing, setEditing] = useState<Member | null>(null),
    [inviting, setInviting] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/board-room/management", {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        return b;
      })
      .then(setData)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [retry]);
  const run: RunCommand = async (command) => {
    const deleting = command.action === "deleteActivities";
    const r = await fetch(
      deleting ? "/api/board-room/activity" : "/api/workspace",
      {
        method: deleting ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleting ? { ids: command.ids } : command),
      },
    );
    const body = await r.json();
    if (!r.ok) throw Error(body.error);
    const snapshot = await fetch("/api/board-room/management", {
      cache: "no-store",
    });
    const next = await snapshot.json();
    if (!snapshot.ok) throw Error(next.error);
    setData(next);
    await onChanged();
    return body;
  };
  if (error)
    return (
      <div role="alert">
        {error}
        <button
          onClick={() => {
            setError("");
            setRetry((r) => r + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="status">
        <Spinner />
        Loading workspace…
      </p>
    );
  const currentData = {
    ...data,
    profile:
      (experience.profile?.version ?? -1) >= (data.profile?.version ?? 0)
        ? experience.profile
        : data.profile,
    settings:
      (experience.settings?.version ?? -1) >= (data.settings?.version ?? 0)
        ? experience.settings
        : data.settings,
  };
  const shared: SharedProps = {
    data: currentData,
    run,
    demo: false,
    openTask: () => {},
    newTask: () => {},
  };
  if (section === "templates")
    return <RoomTemplates room="board" onNavigate={onNavigate} />;
  if (section === "files" || section === "preferences")
    return (
      <AccountSettings
        key={section}
        data={currentData}
        run={run}
        demo={false}
        fileRoom="board"
        onFilesRemoved={onChanged}
        initialTab={section === "files" ? "files" : "account"}
        onLogout={onLogout}
        onExport={() => {
          const link = document.createElement("a");
          link.href = "/api/board-room?export=csv";
          link.download = "board-room-projects.csv";
          link.click();
        }}
      />
    );
  return (
    <div className="shared-management-panel">
      {section === "people" ? (
        <>
          <div className="section-heading">
            <h2>People and invitations</h2>
            {data.actor.isAdmin && (
              <button
                className="button primary"
                onClick={() => setInviting(true)}
              >
                Invite teammate
              </button>
            )}
          </div>
          <PeopleManagement
            room="board"
            {...shared}
            onEdit={setEditing}
            onInvite={() => setInviting(true)}
          />
        </>
      ) : (
        <ActivityManagement {...shared} room="board" onProject={onProject} />
      )}
      {editing && (
        <EditMemberDialog
          member={editing}
          run={run}
          onClose={() => setEditing(null)}
        />
      )}
      {inviting && (
        <InviteDialog run={run} onClose={() => setInviting(false)} />
      )}
    </div>
  );
}
