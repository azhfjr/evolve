"use client";
import { useState, useRef, useEffect, useId } from "react";
import { useConnectedData } from "./data";
export function ProjectPicker({
  value,
  onChange,
  label = "Connected project",
  optional = true,
  disabled = false,
  describedBy,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  optional?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  const wrapper = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null),
    uid = useId();
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const remote = useConnectedData<{
    items: { id: string; name: string; code: string }[];
    total: number;
  }>(`/api/board-room/project-options?q=${encodeURIComponent(q)}&page=${page}`);
  const selected = useConnectedData<{ items: { id: string; name: string }[] }>(
    `/api/board-room/project-options?${value ? "id=" + encodeURIComponent(value) : "q=&page=1"}`,
  );
  return (
    <div
      ref={wrapper}
      className="connected-picker"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <span id={uid + "-label"} className="connected-label">
        {label}
      </span>
      <button
        type="button"
        className="connected-picker-trigger"
        ref={trigger}
        aria-describedby={describedBy}
        aria-labelledby={uid + "-label " + uid + "-value"}
        aria-controls={open ? uid + "-menu" : undefined}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span id={uid + "-value"}>
          {value
            ? selected.data?.items.find((p) => p.id === value)?.name ||
              (selected.busy ? "Loading project…" : "Project unavailable")
            : "Choose project"}
        </span>{" "}
        <span aria-hidden>⌄</span>
      </button>
      {value && selected.error && (
        <p role="alert">
          {selected.error}
          <button type="button" onClick={selected.retry}>
            Retry selected project
          </button>
        </p>
      )}
      {open && (
        <div id={uid + "-menu"} className="connected-picker-menu">
          <input
            ref={search}
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder="Search projects…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {optional && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              Unassigned
            </button>
          )}
          {remote.busy && <p role="status">Loading projects…</p>}
          {remote.error && (
            <p role="alert">
              {remote.error}
              <button type="button" onClick={remote.retry}>
                Retry
              </button>
            </p>
          )}
          {remote.data?.items.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={value === p.id}
              onClick={() => {
                onChange(p.id);
                close();
              }}
            >
              {p.name}
              <small>{p.code}</small>
            </button>
          ))}
          {!remote.busy && remote.data?.items.length === 0 && (
            <p>No matching projects.</p>
          )}
          <div className="connected-actions">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={page * 25 >= (remote.data?.total ?? 0)}
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
