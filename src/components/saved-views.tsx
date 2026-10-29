"use client";
import { useState } from "react";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { savedFilterSchema, type SavedView } from "@/lib/project-model";
import type { WorkspaceData } from "@/lib/types";
import type { RunCommand } from "./workspace-types";
import { Modal, Spinner } from "./ui";
export function SavedViews({
  data,
  run,
  filters,
  onApply,
}: {
  data: WorkspaceData;
  run: RunCommand;
  filters: SavedView["filters"];
  onApply: (filters: SavedView["filters"]) => void;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run({
        action: "createSavedView",
        name,
        filters: savedFilterSchema.parse(filters),
      });
      setName("");
      toast.success("View saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button subtle small-button"
        onClick={() => setOpen(true)}
      >
        <Bookmark size={15} />
        Saved views
      </button>
      {open && (
        <Modal
          open
          title="Your saved views"
          description="Keep useful filters, sorting, and layouts ready for next time."
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="saved-view-list">
            {(data.savedViews || []).map((view) => (
              <div key={view.id}>
                <button
                  onClick={() => {
                    onApply(savedFilterSchema.parse(view.filters));
                    setOpen(false);
                  }}
                >
                  <Bookmark size={16} />
                  <span>
                    {view.name}
                    <small>
                      {view.filters.scope} · {view.filters.view}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete saved view ${view.name}`}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await run({ action: "deleteSavedView", id: view.id });
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!data.savedViews?.length && (
              <p className="field-help">
                No saved views yet. Save the current task view below.
              </p>
            )}
          </div>
          <form className="save-view-form" onSubmit={save}>
            <label>
              Save current view
              <input
                required
                disabled={busy}
                maxLength={40}
                value={name}
                placeholder="e.g. Urgent work awaiting review"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : <Plus size={16} />}Save view
            </button>
          </form>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
