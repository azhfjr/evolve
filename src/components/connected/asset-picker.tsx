"use client";
import { useState, useEffect, useRef, useId } from "react";
import type { Asset } from "@/lib/assets/model";
import { connectedRequest, useConnectedData } from "./data";
export function AssetPicker({
  projectId,
  value,
  onChange,
}: {
  projectId?: string;
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const uid = useId(),
    wrapper = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  type Label = { id: string; code: string; name: string };
  const [known, setKnown] = useState<Map<string, Label>>(new Map()),
    [unavailable, setUnavailable] = useState<Set<string>>(new Set()),
    [selectionError, setSelectionError] = useState(""),
    [retrySelection, setRetrySelection] = useState(0);
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false);
  const initial = useConnectedData<{
    items: { id: string; code: string; name: string }[];
  }>(
    `/api/board-room/assets/selection?projectId=${projectId ?? "00000000-0000-4000-8000-000000000000"}`,
  );
  const initialized = useRef(false);
  useEffect(() => {
    if (initial.data && !initialized.current) {
      initialized.current = true;
      if (value === undefined) onChange(initial.data.items.map((a) => a.id));
    }
  }, [initial.data, onChange, value]);
  const remote = useConnectedData<{ items: Asset[]; total: number }>(
    `/api/board-room/assets?q=${encodeURIComponent(q)}&page=${page}`,
  );
  const chosen = new Map([
    ...known,
    ...(initial.data?.items ?? []).map((a) => [a.id, a] as const),
    ...(remote.data?.items ?? []).map((a) => [a.id, a] as const),
  ]);
  const unavailableSelected = (value ?? []).filter(
    (id) => unavailable.has(id) && !chosen.has(id),
  );
  const missing = (value ?? [])
    .filter((id) => !chosen.has(id) && !unavailable.has(id))
    .join(",");
  useEffect(() => {
    if (!missing || initial.busy) return;
    const c = new AbortController();
    void connectedRequest<{ items: Label[] }>(
      "/api/board-room/assets/selection",
      { ids: missing.split(",") },
      c.signal,
    )
      .then((result) => {
        if (c.signal.aborted) return;
        const returned = new Set(result.items.map((a) => a.id));
        setUnavailable(
          (previous) =>
            new Set([
              ...previous,
              ...missing.split(",").filter((id) => !returned.has(id)),
            ]),
        );
        setKnown(
          (previous) =>
            new Map([
              ...previous,
              ...result.items.map((a) => [a.id, a] as const),
            ]),
        );
        setSelectionError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setSelectionError(e.message);
      });
    return () => c.abort();
  }, [missing, initial.busy, retrySelection]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (
        e.key !== "Escape" ||
        !(e.target instanceof Node) ||
        !wrapper.current?.contains(e.target)
      )
        return;
      // Radix's dialog Escape listener runs at document capture.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <div
      ref={wrapper}
      className="connected-picker br-wide"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id={uid + "-label"} className="connected-label">
        Assets
      </span>
      <button
        type="button"
        className="connected-picker-trigger"
        ref={trigger}
        aria-labelledby={uid + "-label " + uid + "-value"}
        aria-controls={open ? uid + "-menu" : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={uid + "-value"}>{value?.length ?? 0} selected assets</span>{" "}
        <span aria-hidden>⌄</span>
      </button>
      {value?.length ? (
        <div className="connected-actions">
          {value.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => onChange(value.filter((x) => x !== id))}
              aria-label={
                unavailable.has(id) && !chosen.has(id)
                  ? `Remove unavailable asset ${id}`
                  : `Remove asset ${chosen.get(id)?.code ?? "Loading asset…"}`
              }
            >
              {chosen.get(id)?.code ??
                (unavailable.has(id)
                  ? `Unavailable asset (${id.slice(0, 8)})`
                  : "Loading asset…")}{" "}
              ×
            </button>
          ))}
        </div>
      ) : (
        <p>No assets connected. You can connect them later.</p>
      )}
      {initial.error && (
        <p role="alert">
          {initial.error}
          <button type="button" onClick={initial.retry}>
            Retry selection
          </button>
        </p>
      )}
      {unavailableSelected.length > 0 && (
        <p role="alert">
          Selected assets are unavailable. Remove these selections or retry
          loading.{" "}
          <button type="button" onClick={() => setUnavailable(new Set())}>
            Retry unavailable assets
          </button>
        </p>
      )}
      {missing && selectionError && (
        <p role="alert">
          {selectionError}
          <button type="button" onClick={() => setRetrySelection((n) => n + 1)}>
            Retry selected assets
          </button>
        </p>
      )}
      {open && (
        <div id={uid + "-menu"} className="connected-picker-menu">
          <input
            ref={search}
            aria-label="Search project assets"
            value={q}
            placeholder="Search RUPTL code or asset name…"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {remote.busy && <p role="status">Loading assets…</p>}
          {remote.error && (
            <p role="alert">
              {remote.error}
              <button type="button" onClick={remote.retry}>
                Retry
              </button>
            </p>
          )}
          {remote.data?.items.map((a) => {
            const assigned = !!a.projectId && a.projectId !== projectId;
            return (
              <label key={a.id} className="connected-asset-option">
                <input
                  type="checkbox"
                  checked={value?.includes(a.id) ?? false}
                  disabled={assigned}
                  onChange={(e) => {
                    setKnown((previous) => new Map([...previous, [a.id, a]]));
                    onChange(
                      e.target.checked
                        ? [...(value ?? []), a.id]
                        : (value ?? []).filter((id) => id !== a.id),
                    );
                  }}
                />
                <span>
                  {a.code} — {a.name}
                  {assigned && <small>Assigned to {a.projectName}</small>}
                </span>
              </label>
            );
          })}
          <div className="connected-actions">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 50 >= (remote.data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
