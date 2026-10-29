"use client";
import { matchesTaskSearch } from "@/lib/project-labels";
import { AppSelect } from "./app-select";
import { useI18n } from "./i18n-provider";

import { useState, useEffect } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { Modal, StatusIcon } from "./ui";
import type { Task, WorkspaceData } from "@/lib/types";
export function SearchDialog({
  data,
  onClose,
  onSelect,
  demo = false,
}: {
  data: WorkspaceData;
  onClose: () => void;
  onSelect: (task: Task) => void;
  demo?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "false" | "true">("all");
  const [selected, setSelected] = useState(0);
  const [remote, setRemote] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/tasks?${new URLSearchParams({ q: query, limit: "12", archived: scope })}`,
          { signal: abort.signal, cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!abort.signal.aborted) setRemote(body.tasks);
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, demo, scope]);
  const results =
    remote ||
    data.tasks
      .filter(
        (t) =>
          (scope === "all" || t.archived === (scope === "true")) &&
          matchesTaskSearch(t, query),
      )
      .slice(0, 12);
  return (
    <Modal
      open
      className="search-dialog"
      onClose={onClose}
      title={t("Find your next step")}
      description={
        demo
          ? t("Search demo tasks, descriptions, and labels.")
          : t("Cari task, deskripsi, dan label di seluruh workspace.")
      }
    >
      <label className="search-scope">
        {t("Search scope")}
        <AppSelect
          aria-label={t("Search scope")}
          value={scope}
          onValueChange={(nextValue) => {
            setScope(nextValue as typeof scope);
            setRemote(null);
            setSelected(0);
          }}
        >
          <option value="all">{t("Active and archived")}</option>
          <option value="false">{t("Active tasks")}</option>
          <option value="true">{t("Archived tasks")}</option>
        </AppSelect>
      </label>
      <div className="search-modal-input">
        <Search size={20} />
        <input
          role="combobox"
          aria-label={t("Search all tasks")}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="task-search-results"
          aria-activedescendant={
            results[selected]
              ? `search-result-${results[selected].id}`
              : undefined
          }
          placeholder={t("Search tasks, ideas, anything…")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRemote(null);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected(Math.min(results.length - 1, selected + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected(Math.max(0, selected - 1));
            }
            if (e.key === "Enter" && results[selected]) {
              e.preventDefault();
              onSelect(results[selected]);
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div
        className="search-results"
        role="listbox"
        id="task-search-results"
        aria-label={t("Matching tasks")}
      >
        {loading && (
          <p className="search-empty" role="status">
            {t("Mencari…")}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {results.map((task, i) => (
          <button
            role="option"
            id={`search-result-${task.id}`}
            aria-selected={selected === i}
            tabIndex={-1}
            key={task.id}
            className={selected === i ? "selected" : ""}
            onClick={() => onSelect(task)}
            onMouseEnter={() => setSelected(i)}
          >
            <StatusIcon status={task.status} />
            <span>
              {task.title}
              {task.archived && (
                <span className="archive-result-badge">{t("Archived")}</span>
              )}
              <small>
                {data.projects.find((p) => p.id === task.projectId)?.name ||
                  t("No project")}
              </small>
            </span>
            <CornerDownLeft size={14} />
          </button>
        ))}
        {!loading && !results.length && (
          <p className="search-empty">
            {t("No matching tasks. Try a different search.")}
          </p>
        )}
      </div>
      <div className="search-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t("to navigate")}
        </span>
        <span>
          <kbd>↵</kbd> {t("to open")}
        </span>
        {!demo && <span>{t("Seluruh workspace")}</span>}
      </div>
    </Modal>
  );
}
