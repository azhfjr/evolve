"use client";
import { useRef, useState } from "react";
import { Bookmark, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BoardModal } from "./modal";
import { readBoardResponse } from "@/lib/board-room/transport";
import type {
  BoardSavedView,
  BoardViewFilters,
} from "@/lib/board-room/saved-views-model";
export function BoardSavedViews({
  filters,
  onApply,
}: {
  filters: BoardViewFilters;
  onApply: (filters: BoardViewFilters) => void;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [views, setViews] = useState<BoardSavedView[]>([]),
    [name, setName] = useState(""),
    [renaming, setRenaming] = useState<BoardSavedView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const data = await readBoardResponse<{ views: BoardSavedView[] }>(
      await fetch("/api/board-room/views", { cache: "no-store" }),
    );
    setViews(data.views);
    setRenaming((current) =>
      current
        ? data.views.find((view) => view.id === current.id) || current
        : null,
    );
  }
  async function show() {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(method: "POST" | "PATCH" | "DELETE", body: object) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await readBoardResponse<{
        view?: BoardSavedView;
        deletedViewId?: string;
      }>(
        await fetch("/api/board-room/views", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setViews((current) =>
        result.view
          ? [
              ...current.filter((view) => view.id !== result.view!.id),
              result.view,
            ].sort((a, b) => a.name.localeCompare(b.name))
          : current.filter((view) => view.id !== result.deletedViewId),
      );
      if (method !== "DELETE") {
        setName("");
        setRenaming(null);
      }
      toast.success(
        method === "DELETE" ? "Saved view deleted" : "Board view saved",
      );
      try {
        await load();
      } catch {
        setError(
          method === "DELETE"
            ? "The view was deleted, but the list could not refresh. Refresh saved views to check the latest list."
            : "The view was saved, but the list could not refresh. Refresh saved views to check the latest list.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={() => void show()}>
        <Bookmark size={14} />
        Saved views
      </button>
      {open && (
        <BoardModal
          title="Your Board saved views"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="br-dialog-body">
            <p className="br-note">
              Your private portfolio views follow your account across devices.
              Applying a view starts at page one. Save up to 20 views.
            </p>
            <div className="br-saved-view-list" aria-busy={busy}>
              {views.map((view) => (
                <div className="br-saved-view-row" key={view.id}>
                  <button
                    disabled={busy}
                    aria-label={`Apply ${view.name}`}
                    onClick={() => {
                      onApply(view.filters);
                      setOpen(false);
                    }}
                  >
                    <Bookmark size={15} />
                    <span>{view.name}</span>
                  </button>
                  <small>
                    {view.filters.section} · {view.filters.view}
                  </small>
                  <div>
                    <button
                      disabled={busy}
                      aria-label={`Rename ${view.name}`}
                      onClick={() => {
                        setRenaming(view);
                        setName(view.name);
                        nameInput.current?.focus();
                        setError("");
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      disabled={busy}
                      aria-label={`Update ${view.name} with current filters`}
                      onClick={() =>
                        void change("PATCH", {
                          id: view.id,
                          version: view.version,
                          filters,
                        })
                      }
                    >
                      <RefreshCw size={15} />
                    </button>
                    <button
                      disabled={busy}
                      aria-label={`Delete ${view.name}`}
                      onClick={() =>
                        void change("DELETE", {
                          id: view.id,
                          version: view.version,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {!views.length && !busy && (
                <p>No saved views yet. Save your current filters below.</p>
              )}
            </div>
            <form
              className="br-save-view-form"
              onSubmit={(event) => {
                event.preventDefault();
                void change(
                  renaming ? "PATCH" : "POST",
                  renaming
                    ? { id: renaming.id, version: renaming.version, name }
                    : { name, filters },
                );
              }}
            >
              <label>
                View name
                <input
                  ref={nameInput}
                  autoComplete="off"
                  disabled={busy}
                  required
                  maxLength={40}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button className="br-primary" disabled={busy || !name.trim()}>
                {renaming ? "Rename view" : "Save current view"}
              </button>
              {renaming && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(null);
                    setName("");
                  }}
                >
                  Cancel rename
                </button>
              )}
            </form>
            {error && (
              <p className="br-error" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void load()
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Refresh saved views
            </button>
          </div>
        </BoardModal>
      )}
    </>
  );
}
