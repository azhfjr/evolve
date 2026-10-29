"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal, Spinner } from "./ui";
import type { RunCommand } from "./workspace-types";

export type DeletionTarget = {
  kind: "task" | "project";
  id: string;
  name: string;
  version: number;
};

export function DeleteEntityDialog({
  target,
  run,
  onClose,
  onDeleted,
}: {
  target: DeletionTarget;
  run: RunCommand;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // Retain the request identity after an ambiguous network failure.
  const [requestId] = useState(() => crypto.randomUUID());
  const project = target.kind === "project";
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current || (project && confirmation !== "DELETE")) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await run({
        action: project ? "deleteProject" : "deleteTask",
        id: target.id,
        version: target.version,
        idempotencyKey: requestId,
      });
      toast.success(
        project
          ? "Project deleted. Its tasks are kept in No project."
          : "Task deleted",
      );
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!saving.current) onClose();
      }}
      title={project ? "Delete project?" : "Delete task?"}
      description="This permanently deletes the selected item. This cannot be undone."
      className="entity-delete-dialog"
    >
      <form onSubmit={remove}>
        <div className="entity-delete-content" tabIndex={0}>
          <p className="entity-delete-name">{target.name}</p>
          {project ? (
            <>
              <p>
                All tasks, including archived tasks, will be kept in{" "}
                <strong>No project</strong> with their comments and attachments.
              </p>
              <p>
                The project’s Cost items, Expense history, and project
                attachments will be permanently deleted. Existing Activity
                entries will be kept.
              </p>
              <label htmlFor="delete-project-confirmation">
                Type <strong>DELETE</strong> to confirm
                <input
                  id="delete-project-confirmation"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
            </>
          ) : (
            <>
              <p>
                The task, its comments, checklist, and attachments will be
                permanently deleted. Its Evolve event will be removed from
                connected Google calendars when synchronization completes.
              </p>
              <p>
                Other tasks, including later recurring tasks, will be kept.
                Existing Activity entries will be kept. To keep this task for
                later, use Archive instead.
              </p>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            autoFocus={!project}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button danger"
            disabled={busy || (project && confirmation !== "DELETE")}
          >
            {busy ? <Spinner /> : <Trash2 size={15} />}
            {busy ? "Deleting…" : project ? "Delete project" : "Delete task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
