"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  connectionEntitySchema,
  type ConnectionEntity,
} from "@/lib/connection-model";
import { mergeLabels } from "@/lib/labels";
import type { WorkspaceData } from "@/lib/types";
import type { RunCommand } from "./workspace-types";
import { Modal, Spinner } from "./ui";
import { LabelInput } from "./label-input";
export function ConnectionLabelEditor({
  entity,
  data,
  demo,
  run,
  onClose,
  onSaved,
}: {
  entity: ConnectionEntity;
  data: WorkspaceData;
  demo: boolean;
  run: RunCommand;
  onClose: () => void;
  onSaved?: (
    labels: string[],
    previous: string[],
    renames: Record<string, string>,
  ) => void;
}) {
  const savingLock = useRef(false);
  const renames = useRef<Record<string, string>>(Object.create(null));
  const [loaded, setLoaded] = useState(demo);
  const [item, setItem] = useState(entity),
    [labels, setLabels] = useState(entity.labels),
    [pending, setPending] = useState(""),
    [loading, setLoading] = useState(!demo),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch(
      `/api/connections/item?${new URLSearchParams({ kind: entity.kind, id: entity.id })}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Labels could not be loaded.");
        const value = connectionEntitySchema.parse(body);
        if (value.id !== entity.id || value.kind !== "project")
          throw new Error(
            "The current project labels could not be verified. Reload and try again.",
          );
        return value;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          renames.current = Object.create(null);
          setLoaded(true);
          setItem(value);
          setLabels(value.labels);
          setPending("");
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo, entity.id, entity.kind, reload]);
  return (
    <Modal
      open
      title="Edit connection labels"
      description="Project labels are inherited by every task in this project. Other project details stay the same."
      onClose={() => {
        if (!savingLock.current) onClose();
      }}
    >
      <form
        className="standard-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (loading || !loaded || savingLock.current) return;
          savingLock.current = true;
          setSaving(true);
          setError("");
          try {
            const nextLabels = mergeLabels(labels, pending);
            await run({
              action: "updateConnectionLabels",
              kind: item.kind,
              id: item.id,
              version: item.version,
              labels: nextLabels,
            });
            toast.success("Connection labels updated");
            onSaved?.(nextLabels, item.labels, { ...renames.current });
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Labels could not be saved.",
            );
          } finally {
            savingLock.current = false;
            setSaving(false);
          }
        }}
      >
        <p className="connection-edit-title">{entity.title}</p>
        {loading ? (
          <p role="status">
            <Spinner />
            Loading current labels…
          </p>
        ) : loaded ? (
          <LabelInput
            value={labels}
            pending={pending}
            onValueChange={setLabels}
            onLabelRename={(original, replacement) => {
              for (const [from, to] of Object.entries(renames.current)) {
                if (to === original) renames.current[from] = replacement;
              }
              renames.current[original] = replacement;
            }}
            onPendingChange={setPending}
            data={data}
            demo={demo}
            kind={entity.kind}
          />
        ) : null}
        <p className="field-help">
          Removing the selected shared label removes this item from that map. It
          does not delete the item.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {!demo && (
            <button
              type="button"
              className="text-link"
              disabled={saving || loading}
              onClick={() => {
                setLoading(true);
                setLoaded(false);
                setReload((value) => value + 1);
              }}
            >
              <RefreshCw size={14} />
              Reload current labels
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={loading || saving || !loaded}
          >
            {saving ? <Spinner /> : <Save size={15} />}Save labels
          </button>
        </div>
      </form>
    </Modal>
  );
}
