"use client";
import { useState } from "react";
import type { BoardProject } from "@/lib/board-room/model";
import { projectHealth } from "@/lib/board-room/health";
import { boardRequest } from "./api";
export function ProgressReview({
  project,
  admin,
  busy,
  action,
  note,
  onNoteChange,
}: {
  project: BoardProject;
  admin: boolean;
  busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
  note: string;
  onNoteChange: (note: string) => void;
}) {
  const health = projectHealth(project);
  return (
    <section className="br-review-panel" aria-label="Progress review">
      <div className="br-panel-heading">
        <h3>Progress review</h3>
        <span className="br-attention-badge">
          {!project.progressReviewedAt
            ? project.completed
              ? "Completed · not reviewed"
              : "Review due"
            : health.stale
              ? "Review due"
              : "Reviewed"}
        </span>
      </div>
      <p className="br-note">
        Stage indicates the workflow position, not physical completion. Review
        the current stage and yearly plan at least every 30 days.
      </p>
      <dl className="br-review-facts">
        <div>
          <dt>Responsible contact</dt>
          <dd>{project.responsible || "Not assigned"}</dd>
        </div>
        <div>
          <dt>Last progress review</dt>
          <dd>
            {project.progressReviewedAt
              ? new Date(project.progressReviewedAt).toLocaleString("en-GB")
              : "Never reviewed"}
            {project.progressReviewedBy && (
              <small>{project.progressReviewedBy}</small>
            )}
          </dd>
        </div>
      </dl>
      {!!health.missing.length && (
        <p className="br-data-warning">
          Missing information: {health.missing.join(", ")}. Use Edit project to
          complete this record.
        </p>
      )}
      {project.progressReviewNote && (
        <p className="br-review-note">{project.progressReviewNote}</p>
      )}
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && note.trim())
              void action(async () => {
                await boardRequest({
                  action: "reviewProgress",
                  id: project.id,
                  version: project.version,
                  note,
                });
                onNoteChange("");
              });
          }}
        >
          <label>
            Progress review note
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              disabled={busy}
              maxLength={1000}
              required
              rows={2}
              placeholder="Confirm the stage and yearly plan, or describe what needs attention."
            />
          </label>
          <button className="br-primary" disabled={busy || !note.trim()}>
            Confirm progress reviewed
          </button>
        </form>
      )}
    </section>
  );
}
export function DocumentChecklist({
  project,
  admin,
  busy,
  action,
}: {
  project: BoardProject;
  admin: boolean;
  busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [pending, setPending] = useState<{
    index: number;
    checked: boolean;
  } | null>(null);
  if (!project.documentChecklist?.length) return null;
  return (
    <section
      className="br-review-panel"
      aria-label="Required document checklist"
    >
      <h3>Required documents</h3>
      <p className="br-note">
        Admin confirms each requirement against the uploaded files. Changing a
        check resets project validity.
      </p>
      {project.documentChecklist.map((item, index) => (
        <label className="br-document-check" key={`${index}-${item.label}`}>
          <input
            type="checkbox"
            checked={pending?.index === index ? pending.checked : item.checked}
            disabled={!admin || busy || pending !== null}
            onChange={(e) => {
              const checked = e.target.checked;
              setPending({ index, checked });
              void action(() =>
                boardRequest({
                  action: "checkDocument",
                  id: project.id,
                  version: project.version,
                  index,
                  checked,
                }),
              ).finally(() => setPending(null));
            }}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </section>
  );
}
