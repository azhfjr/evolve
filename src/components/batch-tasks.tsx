"use client";
import { AppSelect } from "./app-select";
import { useI18n } from "./i18n-provider";

import { useRef, useState } from "react";
import { Check, Download, Upload, Files } from "lucide-react";
import { toast } from "sonner";
import { Modal, Spinner } from "./ui";
import type { Task, WorkspaceData } from "@/lib/types";
import type { RunCommand } from "./workspace-types";
import type { Command } from "@/lib/validation";
import {
  STATUSES,
  STATUS_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
} from "@/lib/types";
import { CSV_EXAMPLE, previewCSV } from "@/lib/csv-import";
import { taskRangeError } from "@/lib/task-range";
type BulkPatch = Extract<Command, { action: "bulkUpdateTasks" }>["patch"];
export function BulkTaskDialog({
  tasks,
  data,
  run,
  onClose,
}: {
  tasks: Task[];
  data: WorkspaceData;
  run: RunCommand;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [patch, setPatch] = useState<BulkPatch>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef({ fingerprint: "", id: "" });
  const options = tasks.slice(0, 100);
  const selectedTasks = options.filter((task) => selected.includes(task.id));
  return (
    <Modal
      open
      wide
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t("Edit task sekaligus")}
      className="batch-dialog"
      description={t(
        "Pilih maksimal 100 task dari tampilan ini. Seluruh perubahan disimpan bersama; konflik membatalkan batch agar data tidak tertimpa.",
      )}
    >
      <form
        className="standard-form batch-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving || !selectedTasks.length || !Object.keys(patch).length)
            return;
          setSaving(true);
          setError("");
          try {
            // Clearing the deadline clears its range and deadline time too.
            const effectivePatch: BulkPatch =
              patch.dueDate === null
                ? { ...patch, startDate: null, dueTime: null }
                : patch;
            for (const task of selectedTasks) {
              const rangeError = taskRangeError({ ...task, ...effectivePatch });
              if (rangeError) throw new Error(`${task.title}: ${rangeError}`);
            }
            const items = selectedTasks.map(({ id, version }) => ({
              id,
              version,
            }));
            const fingerprint = JSON.stringify({
              items,
              patch: effectivePatch,
            });
            if (fingerprint !== request.current.fingerprint)
              request.current = { fingerprint, id: crypto.randomUUID() };
            await run({
              action: "bulkUpdateTasks",
              items,
              patch: effectivePatch,
              idempotencyKey: request.current.id,
            });
            toast.success(t("{count} tasks updated", { count: items.length }));
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="batch-fields-scroll">
          <fieldset disabled={saving} className="batch-fieldset">
            <label className="checkbox-setting">
              <input
                type="checkbox"
                checked={
                  options.length > 0 && selected.length === options.length
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? options.map((task) => task.id) : [],
                  )
                }
              />
              {t("Select the first {count} tasks", { count: options.length })}
            </label>
            <div className="batch-selection">
              {options.map((task) => (
                <label key={task.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(task.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, task.id]
                          : selected.filter((id) => id !== task.id),
                      )
                    }
                  />
                  <span>{task.title}</span>
                  <small>{t(STATUS_LABEL[task.status])}</small>
                </label>
              ))}
            </div>
            <h3>{t("Perubahan yang akan diterapkan")}</h3>
            <div className="settings-field-grid">
              <label>
                Status
                <AppSelect
                  aria-label={"Status"}
                  value={patch.status || ""}
                  onValueChange={(nextValue) =>
                    setPatch((current) => {
                      const next = { ...current };
                      if (nextValue) next.status = nextValue as Task["status"];
                      else delete next.status;
                      return next;
                    })
                  }
                >
                  <option value="">{t("Pertahankan")}</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(STATUS_LABEL[status])}
                    </option>
                  ))}
                </AppSelect>
              </label>
              <label>
                {t("Prioritas")}
                <AppSelect
                  aria-label={t("Prioritas")}
                  value={patch.priority || ""}
                  onValueChange={(nextValue) =>
                    setPatch((current) => {
                      const next = { ...current };
                      if (nextValue)
                        next.priority = nextValue as Task["priority"];
                      else delete next.priority;
                      return next;
                    })
                  }
                >
                  <option value="">{t("Pertahankan")}</option>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {t(PRIORITY_LABEL[priority])}
                    </option>
                  ))}
                </AppSelect>
              </label>
              <label>
                {t("Penanggung jawab")}
                <AppSelect
                  aria-label={t("Penanggung jawab")}
                  value={
                    patch.assignee === null
                      ? "unassigned"
                      : patch.assignee || ""
                  }
                  onValueChange={(nextValue) =>
                    setPatch((current) => {
                      const next = { ...current };
                      if (nextValue)
                        next.assignee =
                          nextValue === "unassigned" ? null : nextValue;
                      else delete next.assignee;
                      return next;
                    })
                  }
                >
                  <option value="">{t("Pertahankan")}</option>
                  <option value="unassigned">
                    {t("Tanpa penanggung jawab")}
                  </option>
                  {data.members
                    .filter((m) => !m.disabled)
                    .map((m) => (
                      <option key={m.email} value={m.email}>
                        {m.name}
                      </option>
                    ))}
                </AppSelect>
              </label>
              <label>
                {t("Project")}
                <AppSelect
                  aria-label={t("Project")}
                  value={
                    patch.projectId === null ? "none" : patch.projectId || ""
                  }
                  onValueChange={(nextValue) =>
                    setPatch((current) => {
                      const next = { ...current };
                      if (nextValue)
                        next.projectId =
                          nextValue === "none" ? null : nextValue;
                      else delete next.projectId;
                      return next;
                    })
                  }
                >
                  <option value="">{t("Pertahankan")}</option>
                  <option value="none">{t("Tanpa project")}</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </AppSelect>
              </label>
            </div>
            <label className="checkbox-setting">
              <input
                type="checkbox"
                checked={"startDate" in patch}
                onChange={(event) =>
                  setPatch((current) => {
                    const next = { ...current };
                    if (event.target.checked) next.startDate = null;
                    else delete next.startDate;
                    return next;
                  })
                }
              />
              Change start date
            </label>
            {"startDate" in patch && (
              <div>
                <label>
                  Start date
                  <input
                    type="date"
                    aria-label="Start date"
                    value={patch.startDate || ""}
                    onChange={(event) =>
                      setPatch({
                        ...patch,
                        startDate: event.target.value || null,
                      })
                    }
                  />
                </label>
                <p className="field-help">
                  Leave blank to clear only the start date.
                </p>
              </div>
            )}
            <label className="checkbox-setting">
              <input
                type="checkbox"
                checked={"dueDate" in patch}
                onChange={(e) =>
                  setPatch((current) => {
                    const next = { ...current };
                    if (e.target.checked) next.dueDate = null;
                    else delete next.dueDate;
                    return next;
                  })
                }
              />
              {t("Ubah tenggat")}
            </label>
            {"dueDate" in patch && (
              <div>
                <label>
                  {t("Due date")}
                  <input
                    type="date"
                    aria-label={t("Due date")}
                    value={patch.dueDate || ""}
                    onChange={(e) =>
                      setPatch({ ...patch, dueDate: e.target.value || null })
                    }
                  />
                </label>
                <p className="field-help">
                  Leave blank to clear both dates and the due time.
                </p>
              </div>
            )}
            <label>
              {t("Status arsip")}
              <AppSelect
                aria-label={t("Status arsip")}
                value={
                  patch.archived === undefined ? "" : String(patch.archived)
                }
                onValueChange={(nextValue) =>
                  setPatch((current) => {
                    const next = { ...current };
                    if (nextValue) next.archived = nextValue === "true";
                    else delete next.archived;
                    return next;
                  })
                }
              >
                <option value="">{t("Pertahankan")}</option>
                <option value="true">{t("Arsipkan")}</option>
                <option value="false">{t("Pulihkan")}</option>
              </AppSelect>
            </label>
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
        <div className="batch-summary" role="status">
          {selected.length} {t("task dipilih ·")} {Object.keys(patch).length}{" "}
          {t("properti diubah")}
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t("Batal")}
          </button>
          <button
            className="button primary"
            disabled={saving || !selected.length || !Object.keys(patch).length}
          >
            {saving ? <Spinner /> : <Check size={16} />}
            {t("Apply to {count} tasks", { count: selected.length })}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ImportTaskDialog({
  data,
  run,
  onClose,
  projectId,
}: {
  data: WorkspaceData;
  run: RunCommand;
  onClose: () => void;
  projectId?: string;
}) {
  const { t, locale } = useI18n();
  const [plan, setPlan] = useState<ReturnType<typeof previewCSV> | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const id = useRef<string>("");
  function example() {
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + CSV_EXAMPLE], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "evolve-contoh-impor.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Modal
      open
      wide
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t("Impor task dari CSV")}
      className="import-dialog"
      description={t(
        "Periksa data sebelum disimpan. Maksimal 100 task dan 500 KB per impor; seluruh baris harus valid.",
      )}
    >
      <div className="standard-form import-form">
        <div className="import-content">
          <div className="import-start">
            <Files size={30} />
            <p>
              {t(
                "Gunakan kolom contoh. Tanggal memakai YYYY-MM-DD, status seperti todo atau in_progress, dan penanggung jawab memakai email anggota aktif.",
              )}
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={example}
            >
              <Download size={16} />
              {t("Unduh contoh CSV")}
            </button>
            <label className="file-input-label">
              {t("Pilih file CSV")}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={saving}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  setError("");
                  setPlan(null);
                  if (!file) return;
                  setFilename(file.name);
                  try {
                    if (file.size > 500000)
                      throw new Error(
                        t(
                          "File maksimal 500 KB. Pisahkan data menjadi beberapa impor.",
                        ),
                      );
                    const result = previewCSV(
                      await file.text(),
                      data.members,
                      data.projects,
                      projectId || null,
                      locale,
                    );
                    setPlan(result);
                    id.current = crypto.randomUUID();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          {plan && (
            <>
              <div className="batch-summary">
                <strong>{filename}</strong>
                <span>
                  {plan.total} {t("baris ·")} {plan.tasks.length} valid ·{" "}
                  {plan.errors.length} {t("perlu diperbaiki")}
                </span>
              </div>
              {plan.errors.length > 0 && (
                <div className="import-errors" role="alert">
                  <h3>{t("Perbaiki CSV lalu unggah kembali")}</h3>
                  <ul>
                    {plan.errors.map((item) => (
                      <li key={item.row}>
                        {t("Baris")} {item.row}: {t(item.message)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="import-preview">
                <table>
                  <caption>
                    {t("Pratinjau")} {Math.min(plan.tasks.length, 10)}{" "}
                    {t("task pertama")}
                  </caption>
                  <thead>
                    <tr>
                      <th>{t("Judul")}</th>
                      <th>Status</th>
                      <th>{t("Penanggung jawab")}</th>
                      <th>{t("Tenggat")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.tasks.slice(0, 10).map((task, index) => (
                      <tr key={index}>
                        <td>{task.title}</td>
                        <td>{t(STATUS_LABEL[task.status])}</td>
                        <td>{task.assignee || "—"}</td>
                        <td>{task.dueDate || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {t(error)}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t("Batal")}
          </button>
          <button
            className="button primary"
            disabled={
              saving || !plan?.tasks.length || Boolean(plan.errors.length)
            }
            onClick={async () => {
              if (!plan || saving || plan.errors.length) return;
              setSaving(true);
              setError("");
              try {
                await run({
                  action: "importTasks",
                  tasks: plan.tasks,
                  idempotencyKey: id.current,
                });
                toast.success(
                  t("{count} tasks imported", { count: plan.tasks.length }),
                );
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Spinner /> : <Upload size={16} />}
            {t("Import {count} tasks", { count: plan?.tasks.length || 0 })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
