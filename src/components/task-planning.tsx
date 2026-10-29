"use client";
import { TaskRelationships } from "./connected/task-relationships";
import { AppSelect } from "./app-select";
import { useState } from "react";
import { Check, ChevronDown, Copy, Repeat2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "./i18n-provider";
import { Spinner } from "./ui";
import type { TaskDraft } from "@/lib/task-composer";
import type { WorkspaceData } from "@/lib/types";
import type { RunCommand } from "./workspace-types";
import { taskFields } from "@/lib/validation";
import { taskInputFromDraft } from "@/lib/task-composer";
import { taskRangeError } from "@/lib/task-range";
export function TaskPlanning({
  draft,
  update,
  data,
  taskId,
}: {
  draft: TaskDraft;
  update: (patch: Partial<TaskDraft>) => void;
  data?: WorkspaceData;
  taskId?: string;
}) {
  return (
    <section className="task-planning">
      {data?.canonicalProjects && (
        <TaskRelationships
          draft={draft}
          update={update}
          data={data}
          taskId={taskId}
        />
      )}
      <label className="recurrence-control">
        <span>
          <Repeat2 size={16} />
          Repeat task
        </span>
        <AppSelect
          aria-label="Repeat task"
          value={draft.recurrence || ""}
          onValueChange={(nextValue) =>
            update({
              recurrence: (nextValue || null) as TaskDraft["recurrence"],
            })
          }
        >
          <option value="">Does not repeat</option>
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </AppSelect>
        <small>
          A fresh task is created after you complete this one. Your assignee,
          priority, checklist, and scheduled duration are carried forward.
        </small>
        {draft.recurrence && !draft.dueDate && (
          <span className="form-error" role="alert">
            Choose a due date to enable repeating tasks.
          </span>
        )}
      </label>
    </section>
  );
}
export function TaskTemplates({
  draft,
  data,
  run,
  demo,
  onApply,
}: {
  draft: TaskDraft;
  data: WorkspaceData;
  run: RunCommand;
  demo: boolean;
  onApply: (patch: Partial<TaskDraft>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="task-templates">
      <button
        type="button"
        className="text-link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Copy size={15} />
        {t("Template task")}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="template-editor">
          <label>
            {t("Gunakan template")}
            <AppSelect
              aria-label={t("Gunakan template")}
              value={selected}
              onValueChange={(nextValue) => {
                setSelected(nextValue);
                setError("");
              }}
            >
              <option value="">{t("Pilih template")}</option>
              {data.templates?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </AppSelect>
          </label>
          {selected && (
            <div className="template-apply">
              <p>
                {t(
                  "Isi template akan mengganti draft ini. Periksa tanggal dan penanggung jawab sebelum menyimpan.",
                )}
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    const item = data.templates?.find((t) => t.id === selected);
                    if (!item) throw new Error(t("Template tidak tersedia."));
                    const body = demo
                      ? item.body
                      : await fetch(`/api/templates/${item.id}`).then(
                          async (r) => {
                            const result = await r.json();
                            if (!r.ok) throw new Error(result.error);
                            return result.template.body;
                          },
                        );
                    const parsed = taskFields.parse({
                      ...body,
                      labels: [],
                      projectId: data.projects.some(
                        (project) => project.id === body?.projectId,
                      )
                        ? body.projectId
                        : null,
                      parentId: null,
                      dependencies: [],
                    });
                    onApply({
                      ...parsed,
                      startDate: parsed.startDate ?? null,
                      parentId: parsed.parentId ?? null,
                      dependencies: parsed.dependencies ?? [],
                      recurrence: parsed.recurrence ?? null,
                      dueTime: parsed.dueTime ?? null,
                      checklist: parsed.checklist.map((item) => ({
                        ...item,
                        id: crypto.randomUUID(),
                        done: false,
                      })),
                      pendingLabels: "",
                      pendingChecklist: "",
                    });
                    setSelected("");
                    setOpen(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? <Spinner /> : <Check size={15} />}
                {t("Terapkan template")}
              </button>
              {data.templates?.find((t) => t.id === selected) &&
                (data.actor.isAdmin ||
                  data.templates.find((t) => t.id === selected)?.ownerEmail ===
                    data.actor.email) && (
                  <button
                    type="button"
                    className="button subtle"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setError("");
                      try {
                        const item = data.templates!.find(
                          (t) => t.id === selected,
                        )!;
                        await run({
                          action: "archiveTemplate",
                          id: item.id,
                          version: item.version,
                        });
                        setSelected("");
                        toast.success(t("Template diarsipkan"));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    {t("Arsipkan template")}
                  </button>
                )}
            </div>
          )}
          <div className="save-template">
            <label>
              {t("Simpan isi saat ini sebagai template")}
              <input
                value={name}
                maxLength={80}
                placeholder={t("Nama template")}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={saving || !name.trim()}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  const rangeError = taskRangeError(draft);
                  if (rangeError) throw new Error(rangeError);
                  const body = taskFields.parse(taskInputFromDraft(draft));
                  await run({ action: "saveTemplate", name, body });
                  setName("");
                  toast.success(t("Template tersimpan"));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Spinner /> : <Save size={15} />}
              {t("Simpan template")}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
