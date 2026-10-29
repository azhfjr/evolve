"use client";
import { DocumentDateProvider } from "../document-date";
import { Attachments } from "../attachments";
import { ProjectStoryline } from "./project-storyline";
import { useURLState } from "./url-state";
export function CanonicalProjectDocuments({
  projectId,
  actorEmail,
  admin,
  demo,
  revision,
}: {
  projectId: string;
  actorEmail: string;
  admin: boolean;
  demo: boolean;
  revision?: number;
}) {
  const [tab, setTab] = useURLState(
    "projectTab",
    "documents",
    (v) => v === "documents" || v === "storyline",
  );
  return (
    <DocumentDateProvider>
      <nav className="connected-tabs" aria-label="Project document views">
        <button
          type="button"
          aria-current={tab === "documents" ? "page" : undefined}
          onClick={() => setTab("documents")}
        >
          Documents
        </button>
        <button
          type="button"
          aria-current={tab === "storyline" ? "page" : undefined}
          onClick={() => setTab("storyline")}
        >
          Storyline
        </button>
      </nav>
      {tab === "storyline" && !demo ? (
        <ProjectStoryline projectId={projectId} admin={admin} />
      ) : (
        <Attachments
          entityType="boardRoomProject"
          archiveRoom="locker"
          entityId={projectId}
          actorEmail={actorEmail}
          isAdmin={admin}
          demo={demo}
          revision={revision}
        />
      )}
    </DocumentDateProvider>
  );
}
