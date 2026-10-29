"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Pencil, Plus, Tag, X } from "lucide-react";
import { cleanLabel, labelKey, mergeLabels, displayLabel } from "@/lib/labels";
import { renameProjectLabel } from "@/lib/label-edit";
import type { WorkspaceData } from "@/lib/types";
import { connectionCatalogSchema } from "@/lib/connection-model";

export function LabelInput({
  value,
  pending,
  onValueChange,
  onPendingChange,
  onLabelRename,
  data,
  demo,
  kind = "project",
}: {
  value: string[];
  pending: string;
  onValueChange: (labels: string[]) => void;
  onPendingChange: (text: string) => void;
  onLabelRename?: (original: string, replacement: string) => void;
  data: WorkspaceData;
  demo: boolean;
  kind?: "project" | "task";
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    suggestionsRef = useRef<HTMLDivElement>(null),
    renameInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{
      original: string;
      draft: string;
    } | null>(null),
    [focusLabel, setFocusLabel] = useState<{ key: string } | null>(null);
  const editable = kind === "project" && data.actor.isAdmin;
  const editingLabel = editing?.original;
  useLayoutEffect(() => {
    if (!editingLabel) return;
    renameInput.current?.setCustomValidity(
      "Apply or cancel this label rename before saving.",
    );
    renameInput.current?.focus();
    renameInput.current?.select();
  }, [editingLabel]);
  useLayoutEffect(() => {
    if (!focusLabel) return;
    [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        "[data-edit-label]",
      ) || []),
    ]
      .find((button) => button.dataset.editLabel === focusLabel.key)
      ?.focus();
  }, [focusLabel]);
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const [remote, setRemote] = useState<{
    query: string;
    labels: string[];
    next: string | null;
  }>({ query: "", labels: [], next: null });
  const [cursor, setCursor] = useState<string | undefined>(),
    [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(false);
  const query = labelKey(pending),
    full = value.length >= 10;
  useEffect(() => {
    if (!open && !editing) return;
    function closeSuggestions(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        !(event.target instanceof Node) ||
        !root.current?.contains(event.target)
      )
        return;
      // Radix listens at document capture. Handle this nested picker first so
      // the first Escape closes suggestions and the next can close the dialog.
      event.preventDefault();
      event.stopPropagation();
      if (editing) {
        setFocusLabel({ key: labelKey(editing.original) });
        setEditing(null);
        setError("");
      } else input.current?.focus();
      setOpen(false);
    }
    window.addEventListener("keydown", closeSuggestions, true);
    return () => window.removeEventListener("keydown", closeSuggestions, true);
  }, [open, editing]);
  const local = useMemo(
    () =>
      [
        ...new Set(
          data.projects
            .flatMap((project) => project.labels || [])
            .map(labelKey),
        ),
      ]
        .filter(Boolean)
        .sort(),
    [data.projects],
  );
  useEffect(() => {
    if (demo || !open || full) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        setLoadError(false);
        const params = new URLSearchParams({
          mode: "catalog",
          q: query,
          limit: "20",
        });
        if (cursor) params.set("cursor", cursor);
        fetch(`/api/connections?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then(async (response) => {
            if (!response.ok) throw new Error();
            return connectionCatalogSchema.parse(await response.json());
          })
          .then((result) => {
            if (controller.signal.aborted) return;
            setRemote((previous) => ({
              query,
              labels: [
                ...new Set([
                  ...(cursor && previous.query === query
                    ? previous.labels
                    : []),
                  ...result.groups.map((group) => cleanLabel(group.label)),
                ]),
              ],
              next: result.nextCursor,
            }));
          })
          .catch(() => {
            if (!controller.signal.aborted) setLoadError(true);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query && !cursor ? 180 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [demo, open, full, query, cursor, retry]);
  const suggestions = (
    demo ? local : remote.query === query ? remote.labels : []
  ).filter(
    (label) =>
      labelKey(label).includes(query) &&
      !value.some((selected) => labelKey(selected) === labelKey(label)),
  );
  const canCreate =
    query &&
    !value.some((selected) => labelKey(selected) === query) &&
    !suggestions.some((label) => labelKey(label) === query);
  function commit(text = pending) {
    if (!text.trim()) return;
    try {
      onValueChange(mergeLabels(value, text));
      onPendingChange("");
      setCursor(undefined);
      setError("");
    } catch {
      setError("Use up to 10 labels, with no more than 30 characters each.");
    }
  }
  function applyRename() {
    if (!editing) return;
    try {
      const next = renameProjectLabel(value, editing.original, editing.draft);
      onValueChange(next);
      onLabelRename?.(cleanLabel(editing.original), cleanLabel(editing.draft));
      setFocusLabel({ key: labelKey(editing.draft) });
      setEditing(null);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "ZodError"
          ? cause.message
          : "Use one visible label with 1–30 characters.",
      );
      renameInput.current?.focus();
    }
  }
  return (
    <div
      ref={root}
      className="shared-label-editor"
      onBlur={(event) => {
        // Selecting a suggestion must never first commit the partial search text.
        if (
          event.relatedTarget instanceof Node &&
          (event.currentTarget.contains(event.relatedTarget) ||
            event.currentTarget
              .closest('[role="dialog"]')
              ?.contains(event.relatedTarget) ||
            event.currentTarget.closest("form")?.contains(event.relatedTarget))
        )
          return;
        // The inline picker must keep its height when focus moves to another
        // form control, so Save/Cancel stay under the same pointer position.
        // Forms merge pending text on submit; blur never creates a label.
        setOpen(false);
      }}
    >
      <label htmlFor={id}>
        <Tag size={15} /> {kind === "task" ? "Task labels" : "Project labels"}
      </label>
      <p id={`${id}-help`} className="field-help">
        Project labels automatically connect all tasks in the project. Browse
        existing labels or create a lowercase name, such as #system_planning.
      </p>
      {value.length > 0 && (
        <div className="connection-label-chips">
          {value.map((label) => (
            <span key={labelKey(label)}>
              {displayLabel(label)}
              {editable && (
                <button
                  type="button"
                  data-edit-label={labelKey(label)}
                  aria-label={`Edit label ${label}`}
                  onClick={() => {
                    setOpen(false);
                    setError("");
                    setEditing({ original: label, draft: label });
                  }}
                >
                  <Pencil size={13} />
                </button>
              )}
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove label ${label}`}
                  onClick={() =>
                    onValueChange(
                      value.filter((selected) => selected !== label),
                    )
                  }
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {editing && (
        <div className="label-rename-row">
          <label htmlFor={`${id}-rename`}>
            Rename {displayLabel(editing.original)}
          </label>
          <div>
            <input
              ref={renameInput}
              id={`${id}-rename`}
              aria-label="Rename label"
              value={editing.draft}
              maxLength={120}
              onChange={(event) => {
                setEditing({ ...editing, draft: event.target.value });
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  applyRename();
                }
              }}
            />
            <button
              type="button"
              className="button secondary small-button"
              aria-label="Apply label rename"
              onClick={applyRename}
            >
              <Check size={14} />
              Apply
            </button>
            <button
              type="button"
              className="button secondary small-button"
              aria-label="Cancel label rename"
              onClick={() => {
                setFocusLabel({ key: labelKey(editing.original) });
                setEditing(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
          <p className="field-help">
            Applies to this project. Its tasks inherit the renamed label after
            saving.
          </p>
        </div>
      )}
      {editable && (
        <div className="connection-label-entry">
          <input
            ref={input}
            id={id}
            aria-label="Project labels"
            aria-describedby={`${id}-help`}
            value={pending}
            maxLength={120}
            disabled={full}
            placeholder={full ? "10 labels added" : "Search or create a label"}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onPendingChange(event.target.value);
              setCursor(undefined);
              setLoadError(false);
              if (!demo && (labelKey(event.target.value) !== query || !open))
                setLoading(true);
              setOpen(true);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                suggestionsRef.current
                  ?.querySelector<HTMLButtonElement>("button")
                  ?.focus();
              } else if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              } else if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commit();
              }
            }}
          />
          <button
            type="button"
            className="button secondary"
            aria-label="Browse existing labels"
            aria-expanded={open && !full}
            aria-controls={open && !full ? `${id}-suggestions` : undefined}
            disabled={full}
            onClick={() => {
              setOpen(true);
              setCursor(undefined);
            }}
          >
            <Tag size={14} /> Browse
          </button>
        </div>
      )}
      {open && !full && !editing && editable && (
        <div
          ref={suggestionsRef}
          id={`${id}-suggestions`}
          className="label-suggestions"
          role="group"
          aria-label="Existing connection labels"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button"))
              event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              input.current?.focus();
              setOpen(false);
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ];
            const current = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            event.preventDefault();
            if (event.key === "ArrowUp" && current === 0)
              input.current?.focus();
            else
              buttons[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current +
                        (event.key === "ArrowUp" ? -1 : 1) +
                        buttons.length) %
                      buttons.length
              ]?.focus();
          }}
        >
          {loading && (
            <p className="label-picker-message" role="status">
              Loading labels…
            </p>
          )}
          {loadError && (
            <p className="label-picker-message" role="alert">
              Could not load existing labels.{" "}
              <button
                type="button"
                onClick={() => setRetry((previous) => previous + 1)}
              >
                Retry labels
              </button>
            </p>
          )}
          {suggestions.map((label) => (
            <button
              type="button"
              key={labelKey(label)}
              aria-label={`Use ${displayLabel(label)}`}
              onClick={() => commit(cleanLabel(label))}
            >
              <Tag size={12} />
              {displayLabel(label)}
            </button>
          ))}
          {!demo && remote.query === query && remote.next && (
            <button
              type="button"
              disabled={loading}
              onClick={() => setCursor(remote.next!)}
            >
              More existing labels
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="label-create-action"
              aria-label={`Create ${displayLabel(query)}`}
              onClick={() => commit()}
            >
              <Plus size={14} />
              Create {displayLabel(query)}
            </button>
          )}
          {!loading && !loadError && !suggestions.length && !query && (
            <p className="label-picker-message">
              No existing labels yet. Type a name to create one.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
