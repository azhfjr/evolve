"use client";
import { ProjectPicker } from "./connected/project-picker";
import { AppSelect } from "./app-select";
import { useI18n } from "./i18n-provider";

import {
  CalendarDays,
  CircleDot,
  Flag,
  Folder,
  UserRound,
  X,
} from "lucide-react";
import { addDays } from "date-fns";
import type { TaskDraft } from "@/lib/task-composer";
import type { WorkspaceData } from "@/lib/types";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
} from "@/lib/types";

export function TaskProperties({
  draft,
  update,
  data,
  startDateError,
  dueDateError,
}: {
  draft: TaskDraft;
  update: (patch: Partial<TaskDraft>) => void;
  data: WorkspaceData;
  startDateError?: string;
  dueDateError?: string;
}) {
  const { t, formatDate } = useI18n();
  return (
    <aside className="task-editor-properties" aria-label={t("Task properties")}>
      <div className="properties-heading">
        <h2>Properties</h2>
        <p>Ownership, schedule, and priority.</p>
      </div>
      <label className="editor-property">
        <span>
          <Folder size={16} />
          {t("Project")}
        </span>
        <span className="editor-select">
          {data.canonicalProjects ? (
            <ProjectPicker
              label="Project"
              optional={false}
              value={draft.projectId}
              onChange={(projectId) => update({ projectId })}
            />
          ) : (
            <AppSelect
              aria-label={t("Project")}
              value={draft.projectId || ""}
              onValueChange={(nextValue) =>
                update({ projectId: nextValue || null })
              }
            >
              <option value="">{t("No project")}</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id} data-color={p.color}>
                  {p.name}
                </option>
              ))}
            </AppSelect>
          )}
        </span>
      </label>
      <label className="editor-property">
        <span>
          <UserRound size={16} />
          {t("Assignee")}
        </span>
        <span className="editor-select">
          <AppSelect
            aria-label={t("Assignee")}
            value={draft.assignee || ""}
            onValueChange={(nextValue) =>
              update({ assignee: nextValue || null })
            }
          >
            <option value="">{t("Unassigned")}</option>
            {data.members
              .filter((m) => !m.disabled || m.email === draft.assignee)
              .map((m) => (
                <option key={m.email} value={m.email} disabled={m.disabled}>
                  {m.name}
                  {m.email === data.actor.email ? " " + t("(you)") : ""}
                  {m.disabled ? " " + t("(deactivated)") : ""}
                </option>
              ))}
          </AppSelect>
        </span>
      </label>
      <div className="editor-property editor-date-property editor-start-property">
        <label htmlFor="task-start-date">
          <CalendarDays size={16} />
          Start date
        </label>
        <div className="editor-date-input">
          <input
            id="task-start-date"
            aria-label="Start date"
            type="date"
            value={draft.startDate || ""}
            max={draft.dueDate || undefined}
            onChange={(event) =>
              update({ startDate: event.target.value || null })
            }
            aria-invalid={Boolean(startDateError)}
            aria-describedby={
              startDateError ? "task-error-startDate" : "task-start-date-help"
            }
          />
          {draft.startDate && (
            <button
              type="button"
              aria-label="Clear start date"
              onClick={() => update({ startDate: null })}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p id="task-start-date-help" className="field-help">
          Optional. Show this task from its first day through its deadline.
        </p>
        {startDateError && (
          <p
            className="editor-field-error"
            id="task-error-startDate"
            role="alert"
          >
            {startDateError}
          </p>
        )}
      </div>
      <div className="editor-property editor-date-property">
        <label htmlFor="task-due-date">
          <CalendarDays size={16} />
          {t("Due date")}
        </label>
        <div className="editor-date-input">
          <input
            id="task-due-date"
            aria-label={t("Due date")}
            type="date"
            value={draft.dueDate || ""}
            min={draft.startDate || undefined}
            onChange={(e) =>
              update({
                dueDate: e.target.value || null,
                ...(!e.target.value ? { dueTime: null, startDate: null } : {}),
              })
            }
            aria-invalid={Boolean(dueDateError)}
            aria-describedby={dueDateError ? "task-error-dueDate" : undefined}
          />
          {draft.dueDate && (
            <button
              type="button"
              aria-label={t("Clear due date")}
              onClick={() =>
                update({ dueDate: null, startDate: null, dueTime: null })
              }
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p className="field-help">The end date is this task’s deadline.</p>
        {draft.dueDate && (
          <div className="editor-due-time">
            <label>
              {t("Jam tenggat (opsional)")}
              <input
                type="time"
                aria-label={t("Jam tenggat")}
                value={draft.dueTime || ""}
                onChange={(e) => update({ dueTime: e.target.value || null })}
              />
            </label>
            {draft.dueTime && (
              <label>
                {t("Zona waktu tenggat")}
                <AppSelect
                  aria-label={t("Zona waktu tenggat")}
                  value={draft.dueTimeZone || "Asia/Jakarta"}
                  onValueChange={(nextValue) =>
                    update({ dueTimeZone: nextValue })
                  }
                >
                  {[
                    ...new Set([
                      draft.dueTimeZone || "Asia/Jakarta",
                      data.profile?.timeZone || "Asia/Jakarta",
                      "Asia/Jakarta",
                      "Asia/Makassar",
                      "Asia/Jayapura",
                      "Asia/Singapore",
                      "UTC",
                      "Europe/London",
                      "America/New_York",
                    ]),
                  ].map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </AppSelect>
              </label>
            )}
            <small>
              {t("Zona waktu task tetap sama saat penanggung jawab berubah.")}
            </small>
          </div>
        )}
        <div className="editor-date-shortcuts">
          {[
            [t("Today"), 0],
            [t("Tomorrow"), 1],
          ].map(([label, offset]) => (
            <button
              type="button"
              key={label}
              onClick={() =>
                update({
                  dueDate: formatDate(
                    addDays(new Date(), Number(offset)),
                    "yyyy-MM-dd",
                  ),
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        {dueDateError && (
          <p
            className="editor-field-error"
            id="task-error-dueDate"
            role="alert"
          >
            {dueDateError}
          </p>
        )}
      </div>
      <label className="editor-property">
        <span>
          <CircleDot size={16} />
          Status
        </span>
        <span className={`editor-select editor-status-${draft.status}`}>
          <AppSelect
            aria-label="Status"
            value={draft.status}
            onValueChange={(nextValue) =>
              update({ status: nextValue as TaskDraft["status"] })
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </option>
            ))}
          </AppSelect>
        </span>
      </label>
      <label className="editor-property">
        <span>
          <Flag size={16} />
          {t("Priority")}
        </span>
        <span className="editor-select">
          <AppSelect
            aria-label={t("Priority")}
            value={draft.priority}
            onValueChange={(nextValue) =>
              update({
                priority: nextValue as TaskDraft["priority"],
              })
            }
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(PRIORITY_LABEL[p])}
              </option>
            ))}
          </AppSelect>
        </span>
      </label>
    </aside>
  );
}
