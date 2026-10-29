"use client";
import { ProjectPicker } from "./project-picker";
import { useURLState } from "./url-state";
import { ProjectStoryline } from "./project-storyline";
import { DocumentDateProvider } from "../document-date";
export function StorylineWorkspace({ admin }: { admin: boolean }) {
  const [id, setId] = useURLState("storyProject", "");
  return (
    <section className="connected-form">
      <ProjectPicker
        label="Storyline project"
        value={id || null}
        onChange={(id) => setId(id ?? "")}
      />
      {id ? (
        <DocumentDateProvider key={id}>
          <a
            href={
              "/board-room/projects/" +
              encodeURIComponent(id) +
              "?projectTab=documents"
            }
          >
            Open project documents
          </a>
          <ProjectStoryline projectId={id} admin={admin} />
        </DocumentDateProvider>
      ) : (
        <div className="br-panel connected-form">
          <h2>Choose a project for its Storyline</h2>
          <p>
            Search by project name or ID. Dated documents form the chronology;
            undated documents remain explicitly separate.
          </p>
        </div>
      )}
    </section>
  );
}
