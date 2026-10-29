"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Check, ExternalLink, RefreshCw } from "lucide-react";
import type { Task } from "@/lib/types";
import { Spinner } from "./ui";
type State = {
  configured: boolean;
  connected: boolean;
  enabledByAdmin: boolean;
  selected: boolean;
  eligible: boolean;
  taskState: string;
  lastSyncedAt: string | null;
  errorCode: string | null;
  reminders: number[];
};
export function TaskCalendar({ task, demo }: { task: Task; demo: boolean }) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const r = await fetch(`/api/tasks/${task.id}/calendar`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setState(b);
        setError("");
        if (b.taskState === "pending")
          timer = setTimeout(() => {
            if (!document.hidden) void load();
            else timer = setTimeout(load, 4000);
          }, 4000);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [demo, task.id, task.version, retry]);
  async function act(connect = false, enabled = true) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        connect ? "/api/calendar" : `/api/tasks/${task.id}/calendar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            connect ? { action: "connect", taskId: task.id } : { enabled },
          ),
        },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (connect) window.location.assign(b.url);
      else {
        setState(b);
        setRetry((n) => n + 1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const eligible = !task.archived && task.status !== "done" && !!task.dueDate;
  const labels: Record<string, string> = {
    paused: "Paused by administrator",
    disconnected: "Connect your Google Calendar",
    not_scheduled: "Not scheduled",
    error: "Sync needs attention",
    pending: "Sync queued",
    synced: "Synced to your Calendar",
    not_synced: "Ready to sync",
  };
  return (
    <section className="task-calendar-card">
      <div className="task-calendar-heading">
        <CalendarDays size={19} />
        <div>
          <h3>Google Calendar</h3>
          <p>
            {demo
              ? "Connect Calendar in your signed-in workspace."
              : labels[state?.taskState || ""] || "Checking your Calendar…"}
          </p>
        </div>
        {state?.taskState === "synced" && <Check size={19} />}
      </div>
      <p className="field-help">
        {!eligible
          ? "Save an active task with a due date to schedule it."
          : "Evolve sends this task to your private Evolve calendar. Changes in Google Calendar do not update the task."}
        {eligible &&
          task.startDate &&
          task.startDate !== task.dueDate &&
          " The event spans the full date range. Calendar reminders are relative to the event start, not the task deadline."}
        {eligible &&
          (!task.startDate || task.startDate === task.dueDate) &&
          !task.dueTime &&
          " All-day reminders are relative to midnight; add a due time for a precise reminder."}
      </p>
      {state?.lastSyncedAt && (
        <small>
          Last synced{" "}
          {new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: task.dueTimeZone || "Asia/Jakarta",
          }).format(new Date(state.lastSyncedAt))}
        </small>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => setRetry((n) => n + 1)}
          >
            Check again
          </button>
        </p>
      )}
      {!demo && state && (
        <div className="task-calendar-actions">
          {!state.connected || state.errorCode === "reconnect_required" ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy || !state.configured || !state.enabledByAdmin}
              onClick={() => void act(true)}
            >
              {busy ? <Spinner /> : <CalendarDays size={15} />}Connect Google
              Calendar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={
                  busy ||
                  (!eligible &&
                    !(state.taskState === "error" && !state.selected)) ||
                  !state.enabledByAdmin
                }
                onClick={() =>
                  void act(
                    false,
                    state.taskState === "error" ? state.selected : true,
                  )
                }
              >
                {busy ? <Spinner /> : <RefreshCw size={15} />}{" "}
                {state.taskState === "error"
                  ? "Retry sync"
                  : state.selected
                    ? "Sync now"
                    : "Add to my Calendar"}
              </button>
              {state.selected && (
                <button
                  type="button"
                  className="text-link"
                  disabled={busy || !state.enabledByAdmin}
                  onClick={() => void act(false, false)}
                >
                  Remove from my Calendar
                </button>
              )}
              <a
                className="button subtle"
                href="https://calendar.google.com/calendar/u/0/r"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Calendar
                <ExternalLink size={14} />
              </a>
            </>
          )}
        </div>
      )}
    </section>
  );
}
