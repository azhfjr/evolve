"use client";
import { eventMessage } from "@/lib/i18n/events";
import { useI18n } from "./i18n-provider";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckSquare,
  ClipboardList,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Tag,
  Trash2,
} from "lucide-react";

import { toast } from "sonner";
import type { Activity, Comment, Task, WorkspaceData } from "@/lib/types";
import { validationMessage } from "@/lib/i18n/validation";
import { taskFields } from "@/lib/validation";
import { taskRangeError } from "@/lib/task-range";
import { displayLabel } from "@/lib/labels";
import { projectLabels } from "@/lib/project-labels";
import {
  initialTaskDraft,
  readTaskDraft,
  removeTaskDraft,
  taskDraftKey,
  taskInputFromDraft,
  writeTaskDraft,
  type TaskDefaults,
  type TaskDraft,
} from "@/lib/task-composer";
import type { RunCommand } from "./workspace-types";
import { Avatar, Modal, Spinner } from "./ui";
import { TaskProperties } from "./task-properties";
import { Attachments } from "./attachments";
import { DraftAttachments } from "./draft-attachments";
import type { AttachmentInfo } from "@/lib/attachment-types";
import { TaskCalendar as TaskCalendarCard } from "./task-calendar";
import { TaskPlanning, TaskTemplates } from "./task-planning";
import {
  useDraftSession,
  DRAFT_SESSION_ENDED,
} from "./connected/draft-session";
import { demoDiscussion } from "@/lib/client-store";

type FieldErrors = Partial<Record<keyof TaskDraft, string>>;
export type TaskEditorHandle = {
  requestLeave: (
    proceed: () => void,
    confirmEvenForDraft?: boolean,
  ) => "left" | "confirm" | "busy";
};
export function TaskEditor({
  ref,
  task,
  defaults = {},
  data,
  run,
  onClose,
  demo,
  onArchiveChange,
  onDeleteTask,
}: {
  ref?: Ref<TaskEditorHandle>;
  task: Task | null;
  defaults?: TaskDefaults;
  data: WorkspaceData;
  run: RunCommand;
  onClose: () => void;
  demo: boolean;
  onOpenTask?: (task: Task) => void;
  onArchiveChange?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
}) {
  const { t, locale, relativeTime } = useI18n();
  const draftKey = taskDraftKey(data.actor.email, demo, defaults, task?.id);
  const [seed] = useState(() => initialTaskDraft(task, defaults));
  const [restored, setRestored] = useState(() => readTaskDraft(draftKey));
  const [draft, setDraft] = useState<TaskDraft>(() => seed);
  const [baseline, setBaseline] = useState(() => JSON.stringify(seed));
  const dirty = JSON.stringify(draft) !== baseline;
  const [showChecklist, setShowChecklist] = useState(
    Boolean(draft.checklist.length || draft.pendingChecklist),
  );
  const [createAnother, setCreateAnother] = useState(false);
  const [draftSaved, setDraftSaved] = useState(Boolean(restored));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false),
    [attachmentBlocked, setAttachmentBlocked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { ended: sessionEnded, active: sessionActive } = useDraftSession(
    formRef,
    [draftKey],
    !demo,
  );
  const savingRef = useRef(false);
  const completedRequestId = useRef<string | null>(null);
  // A queued autosave or navigation callback must not resurrect a committed draft.
  const persistDraft = useCallback(
    (value: TaskDraft) =>
      sessionActive() &&
      (completedRequestId.current === value.requestId ||
        writeTaskDraft(draftKey, value, Boolean(data.canonicalProjects))),
    [draftKey, data.canonicalProjects, sessionActive],
  );
  const draftSnapshot = useRef({ draft, dirty, restored });
  const discardedDraft = useRef(false);
  useEffect(() => {
    draftSnapshot.current = { draft, dirty, restored };
  }, [draft, dirty, restored]);
  useEffect(
    () => () => {
      const latest = draftSnapshot.current;
      if (latest.dirty && !latest.restored && !discardedDraft.current)
        persistDraft(latest.draft);
    },
    [persistDraft],
  );
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const focusNextTitle = useRef(false);
  const version = useRef(task?.version);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorFocusRequest, requestErrorFocus] = useState(0);
  useLayoutEffect(() => {
    if (errorFocusRequest)
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid=true]")
        ?.focus();
  }, [errorFocusRequest]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [loadingDiscussion, setLoadingDiscussion] = useState(Boolean(task));
  const [discussionError, setDiscussionError] = useState(false);
  const [tab, setTab] = useState<"comments" | "activity">("comments");

  useEffect(() => {
    if (!saving && focusNextTitle.current) {
      focusNextTitle.current = false;
      titleRef.current?.focus();
    }
  }, [saving, draft.requestId]);

  useEffect(() => {
    if (!dirty || restored) return;
    const timer = setTimeout(() => setDraftSaved(persistDraft(draft)), 250);
    return () => clearTimeout(timer);
  }, [draft, persistDraft, task, dirty, restored]);

  useEffect(() => {
    if (!task) return;
    let alive = true;
    async function load() {
      try {
        const result = demo
          ? {
              ...demoDiscussion(task!.id),
              activities: data.activities.filter((a) => a.taskId === task!.id),
            }
          : await fetch(`/api/workspace?taskId=${task!.id}`).then(async (r) => {
              if (!r.ok) throw new Error();
              return r.json();
            });
        if (alive) {
          setComments(result.comments);
          setActivities(result.activities);
        }
      } catch {
        if (alive) setDiscussionError(true);
      } finally {
        if (alive) setLoadingDiscussion(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
    // The open task retains its edit version while the workspace refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, demo]);

  function update(patch: Partial<TaskDraft>) {
    discardedDraft.current = false;
    setDraft((current) => ({ ...current, ...patch }));
    setDraftSaved(false);
    setFieldErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) =>
            !(key in patch) &&
            !(
              ("startDate" in patch || "dueDate" in patch) &&
              (key === "startDate" || key === "dueDate")
            ),
        ),
      ),
    );
  }
  function requestLeave(proceed: () => void, confirmEvenForDraft = false) {
    if (savingRef.current || commenting || attachmentBusy)
      return "busy" as const;
    if (
      !task &&
      !confirmEvenForDraft &&
      !attachmentBlocked &&
      !comment.trim() &&
      (!dirty || persistDraft(draft))
    ) {
      proceed();
      return "left" as const;
    }
    if (dirty || comment.trim() || attachmentBlocked) {
      pendingLeave.current = proceed;
      setConfirmDiscard(true);
      return "confirm" as const;
    }
    proceed();
    return "left" as const;
  }
  useImperativeHandle(ref, () => ({ requestLeave }));
  function requestClose() {
    requestLeave(onClose);
  }
  function keepEditing() {
    pendingLeave.current = null;
    setConfirmDiscard(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty) persistDraft(draft);
      if (
        (task && dirty) ||
        comment.trim() ||
        attachmentBusy ||
        attachmentBlocked
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [
    task,
    dirty,
    draftKey,
    persistDraft,
    draft,
    comment,
    attachmentBusy,
    attachmentBlocked,
  ]);
  function changeAttachments(attachments: AttachmentInfo[]) {
    setDraft((current) => {
      const next = { ...current, attachments };
      persistDraft(next);
      return next;
    });
    setDraftSaved(false);
  }
  function discardDraft() {
    discardedDraft.current = true;
    removeDraftUploads();
    setAttachmentBlocked(false);
    removeTaskDraft(draftKey);
    setDraft(seed);
    setBaseline(JSON.stringify(seed));
    setRestored(null);
    setDraftSaved(false);
    setFieldErrors({});
    setError("");
    setShowChecklist(false);
    titleRef.current?.focus();
  }
  function removeDraftUploads() {
    if (!task)
      for (const item of draft.attachments)
        void fetch(`/api/attachments/${item.id}?draftId=${draft.requestId}`, {
          method: "DELETE",
        }).catch(() => {});
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current || attachmentBusy || attachmentBlocked) return;
    setError("");
    if (task && !version.current) {
      setError(
        "This older draft has no record version. Copy your changes and reload before saving.",
      );
      return;
    }
    const rangeError = taskRangeError(draft);
    if (rangeError) {
      setFieldErrors({ dueDate: rangeError });
      requestErrorFocus((request) => request + 1);
      return;
    }
    const parsed = taskFields.safeParse(
      taskInputFromDraft(draft, Boolean(data.canonicalProjects)),
    );
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof TaskDraft;
        errors[field] =
          field === "title"
            ? t("Enter a task title (up to 200 characters).")
            : field === "labels"
              ? t("Use up to 10 labels, with no more than 30 characters each.")
              : field === "checklist"
                ? t(
                    "Use up to 100 checklist items, with no more than 200 characters each.",
                  )
                : validationMessage(issue, locale);
      }
      setFieldErrors(errors);
      if (errors.checklist) setShowChecklist(true);
      requestErrorFocus((request) => request + 1);
      return;
    }
    const { labels: inheritedLabels, ...taskPatch } = parsed.data;
    void inheritedLabels;
    savingRef.current = true;
    setSaving(true);
    try {
      await run(
        task
          ? {
              action: "updateTask",
              id: task.id,
              version: version.current!,
              patch: taskPatch,
            }
          : {
              action: "createTask",
              task: parsed.data,
              idempotencyKey: draft.requestId,
              ...(draft.attachments.length
                ? { attachmentIds: draft.attachments.map((item) => item.id) }
                : {}),
            },
      );
      completedRequestId.current = draft.requestId;
      removeTaskDraft(draftKey);
      setRestored(null);
      toast.success(task ? t("Task updated") : t("Task created"));
      if (!task && createAnother) {
        const next = {
          ...draft,
          title: "",
          description: "",
          checklist: [],
          labels: [],
          pendingChecklist: "",
          pendingLabels: "",
          requestId: crypto.randomUUID(),
          pendingChecklistId: crypto.randomUUID(),
          attachments: [],
        };
        focusNextTitle.current = true;
        setBaseline(JSON.stringify(next));
        setDraft(next);
        setDraftSaved(false);
        setFieldErrors({});
      } else onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Couldn’t save the task. Your changes are still here."),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function addItem() {
    const text = draft.pendingChecklist.trim();
    if (!text) return;
    if (draft.checklist.length >= 100) {
      setFieldErrors((errors) => ({
        ...errors,
        checklist: t("A task can have up to 100 checklist items."),
      }));
      return;
    }
    update({
      checklist: [
        ...draft.checklist,
        { id: draft.pendingChecklistId, text, done: false },
      ],
      pendingChecklist: "",
      pendingChecklistId: crypto.randomUUID(),
    });
  }
  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !comment.trim() || commenting) return;
    setCommenting(true);
    try {
      const result = await run({
        action: "addComment",
        taskId: task.id,
        body: comment.trim(),
      });
      setComments((current) => [...current, result.comment as Comment]);
      setComment("");
      toast.success(t("Comment added"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommenting(false);
    }
  }
  async function archive() {
    if (!task || savingRef.current) return;
    if (dirty || comment.trim()) {
      setError(t("Save or discard your changes before archiving this task."));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await run({
        action: "updateTask",
        id: task.id,
        version: version.current!,
        patch: { archived: !task.archived },
      });
      if (result.task && onArchiveChange) onArchiveChange(result.task as Task);
      else
        toast.success(
          task.archived
            ? t("Task restored")
            : t("Task archived. You can restore it from Archive."),
        );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function fieldError(field: keyof TaskDraft) {
    return fieldErrors[field] ? (
      <p className="editor-field-error" id={`task-error-${field}`} role="alert">
        {t(fieldErrors[field]!)}
      </p>
    ) : null;
  }
  const discardDialog = confirmDiscard ? (
    <Modal
      open
      onClose={keepEditing}
      title={t("Discard unsaved changes?")}
      description={t("Your changes haven’t been saved.")}
      className="task-discard-modal"
    >
      <div className="task-discard-body">
        <p>
          {t(
            "Keep editing to save your work, or discard these changes and close the task.",
          )}
        </p>
        <div className="form-actions">
          <button className="button secondary" autoFocus onClick={keepEditing}>
            {t("Keep editing")}
          </button>
          <button
            className="button danger-button"
            onClick={() => {
              discardedDraft.current = true;
              removeDraftUploads();
              removeTaskDraft(draftKey);
              setConfirmDiscard(false);
              const proceed = pendingLeave.current;
              pendingLeave.current = null;
              proceed?.();
            }}
          >
            {t("Discard changes")}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;
  return (
    <section
      className={`task-editor-page ${task ? "task-editor-existing" : ""}`}
      role="region"
      aria-label="Task editor"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !document.querySelector('[role="listbox"],[role="dialog"]')
        ) {
          event.preventDefault();
          requestClose();
        }
      }}
    >
      {discardDialog}
      <header className="task-page-heading">
        <div className="task-page-tools">
          <button type="button" className="editor-back" onClick={requestClose}>
            <ArrowLeft size={18} /> Back to workspace
          </button>
          {task && data.actor.isAdmin && onDeleteTask && (
            <button
              type="button"
              className="button secondary entity-delete-trigger"
              disabled={saving || commenting || attachmentBusy}
              onClick={() => {
                if (dirty || comment.trim()) {
                  setError(
                    "Save or discard your changes before deleting this task.",
                  );
                  return;
                }
                onDeleteTask({ ...task, version: version.current! });
              }}
            >
              <Trash2 size={15} />
              Delete task
            </button>
          )}
        </div>
        <div>
          <h1>{task ? "Task details" : "Create task"}</h1>
          <p>
            {task
              ? t("Created {time}", {
                  time: relativeTime(new Date(task.createdAt)),
                })
              : "Give the work a name. Add the context your team needs."}
          </p>
        </div>
      </header>
      <div className="task-editor-scroll">
        {restored && (
          <div className="task-draft-notice">
            <span>A saved task draft is available. Review before saving.</span>
            <button
              type="button"
              onClick={() => {
                setDraft(restored);
                if (task) version.current = restored.baseVersion ?? 0;
                setRestored(null);
              }}
            >
              Restore draft
            </button>
            <button type="button" onClick={discardDraft}>
              {t("Discard draft")}
            </button>
          </div>
        )}
        {task?.archived && (
          <div className="archive-detail-banner">
            <Archive size={18} />
            <div>
              <strong>{t("Archived task")}</strong>
              <p>
                {t(
                  "This task is kept in Archive. Restore it to continue your active work.",
                )}
              </p>
            </div>
          </div>
        )}
        {sessionEnded && <p role="alert">{DRAFT_SESSION_ENDED}</p>}
        <form
          id="task-editor-form"
          ref={formRef}
          onSubmit={submit}
          noValidate
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.stopPropagation();
              formRef.current?.requestSubmit();
            }
          }}
        >
          <fieldset
            className="task-editor-layout"
            disabled={
              saving ||
              (data.settings?.configuration?.readOnly && !data.actor.isAdmin)
            }
          >
            <legend className="sr-only">
              {t("Task content and properties")}
            </legend>
            <section
              className="task-editor-content"
              aria-label={t("Task content")}
            >
              <TaskTemplates
                draft={draft}
                data={data}
                run={run}
                demo={demo}
                onApply={(patch) => {
                  update(patch);
                  setShowChecklist(Boolean(patch.checklist?.length));
                }}
              />
              <div className="editor-essentials-card">
                <div className="form-card-heading">
                  <span className="form-card-icon">
                    <ClipboardList size={20} />
                  </span>
                  <div>
                    <h3>Task essentials</h3>
                  </div>
                </div>
                <div className="editor-title-field">
                  <label htmlFor="task-title">
                    {t("Task title")} <span>{t("Required")}</span>
                  </label>
                  <textarea
                    ref={titleRef}
                    id="task-title"
                    aria-label={t("Task title")}
                    rows={2}
                    maxLength={200}
                    required
                    placeholder={t("What needs to get done?")}
                    value={draft.title}
                    aria-invalid={Boolean(fieldErrors.title)}
                    aria-describedby={
                      fieldErrors.title ? "task-error-title" : undefined
                    }
                    onChange={(e) => update({ title: e.target.value })}
                  />
                  {fieldError("title")}
                </div>
                <div className="editor-description-field">
                  <label htmlFor="task-description">
                    {t("Description")} <span>{t("Optional")}</span>
                  </label>
                  <textarea
                    id="task-description"
                    aria-label={t("Description")}
                    rows={4}
                    maxLength={20000}
                    placeholder={t(
                      "Add the context, desired outcome, or links your team needs.",
                    )}
                    value={draft.description}
                    aria-invalid={Boolean(fieldErrors.description)}
                    aria-describedby={
                      fieldErrors.description
                        ? "task-error-description"
                        : undefined
                    }
                    onChange={(e) => update({ description: e.target.value })}
                  />
                  {fieldError("description")}
                </div>
              </div>
              <div className="task-editor-additions">
                <button
                  type="button"
                  aria-expanded={showChecklist}
                  aria-controls="task-checklist"
                  className={showChecklist ? "active" : ""}
                  onClick={() => setShowChecklist(!showChecklist)}
                >
                  <CheckSquare size={16} />
                  Checklist{" "}
                  {draft.checklist.length > 0 && (
                    <span>{draft.checklist.length}</span>
                  )}
                </button>
                {!task && (
                  <button
                    type="button"
                    disabled={demo || attachmentBusy}
                    aria-controls="task-draft-attachments"
                    onClick={() => {
                      const section = document.getElementById(
                        "task-draft-attachments",
                      );
                      section?.scrollIntoView({ block: "center" });
                      section
                        ?.querySelector<HTMLInputElement>("input[type=file]")
                        ?.click();
                    }}
                  >
                    <Paperclip size={16} />
                    Attachments{" "}
                    {draft.attachments.length > 0 && (
                      <span>{draft.attachments.length}</span>
                    )}
                  </button>
                )}
              </div>
              {showChecklist && (
                <section
                  className="editor-checklist"
                  id="task-checklist"
                  aria-label={t("Task checklist")}
                >
                  <div className="editor-section-heading">
                    <h3>Checklist</h3>
                    <span>
                      {t("{done} of {total} done", {
                        done: draft.checklist.filter((item) => item.done)
                          .length,
                        total: draft.checklist.length,
                      })}
                    </span>
                  </div>
                  {draft.checklist.length > 0 && (
                    <div
                      className="editor-checklist-progress"
                      role="progressbar"
                      aria-label={t("Checklist completion")}
                      aria-valuenow={
                        draft.checklist.filter((item) => item.done).length
                      }
                      aria-valuemin={0}
                      aria-valuemax={draft.checklist.length}
                    >
                      <span
                        style={{
                          width: `${(draft.checklist.filter((item) => item.done).length / draft.checklist.length) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                  {draft.checklist.map((item) => (
                    <div className="editor-checklist-item" key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() =>
                            update({
                              checklist: draft.checklist.map((c) =>
                                c.id === item.id ? { ...c, done: !c.done } : c,
                              ),
                            })
                          }
                        />
                        <span className={item.done ? "strikethrough" : ""}>
                          {item.text}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("Remove {item}", { item: item.text })}
                        onClick={() =>
                          update({
                            checklist: draft.checklist.filter(
                              (c) => c.id !== item.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <div className="editor-checklist-add">
                    <Plus size={16} />
                    <input
                      aria-label={t("New checklist item")}
                      placeholder={t("Add a step…")}
                      value={draft.pendingChecklist}
                      maxLength={200}
                      aria-invalid={Boolean(fieldErrors.checklist)}
                      aria-describedby={
                        fieldErrors.checklist
                          ? "task-error-checklist"
                          : "task-checklist-hint"
                      }
                      onChange={(e) =>
                        update({ pendingChecklist: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          addItem();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={!draft.pendingChecklist.trim()}
                      onClick={addItem}
                    >
                      {t("Add")}
                    </button>
                  </div>
                  <p className="editor-hint" id="task-checklist-hint">
                    {t(
                      "Press Enter to add a step. Unfinished input is included when you save.",
                    )}
                  </p>
                  {fieldError("checklist")}
                </section>
              )}
              <section
                className="editor-labels inherited-project-labels"
                aria-label="Project labels"
              >
                <h3>
                  <Tag size={15} /> Project labels
                </h3>
                <div className="connection-label-chips">
                  {projectLabels(data.projects, draft.projectId).map(
                    (label) => (
                      <span key={label}>{displayLabel(label)}</span>
                    ),
                  )}
                </div>
                <p className="editor-hint">
                  {draft.projectId
                    ? "Inherited from project. Manage labels in Project settings."
                    : "Select a project to inherit its labels."}
                </p>
              </section>
              <TaskPlanning
                draft={draft}
                update={update}
                data={data}
                taskId={task?.id}
              />
              {fieldError("recurrence")}
            </section>
            <TaskProperties
              draft={draft}
              update={update}
              data={data}
              startDateError={fieldErrors.startDate}
              dueDateError={fieldErrors.dueDate}
            />
          </fieldset>
        </form>
        {task && <TaskCalendarCard task={task} demo={demo} />}
        {!task && (
          <DraftAttachments
            key={draft.requestId}
            draftId={draft.requestId}
            value={draft.attachments}
            onChange={changeAttachments}
            onBusy={setAttachmentBusy}
            onBlocked={setAttachmentBlocked}
            demo={demo}
          />
        )}
        {task && (
          <Attachments
            entityType="task"
            entityId={task.id}
            actorEmail={data.actor.email}
            isAdmin={data.actor.isAdmin}
            demo={demo}
            revision={data.revision}
          />
        )}
        {task && (
          <section className="discussion">
            <div className="discussion-tabs">
              <button
                className={tab === "comments" ? "active" : ""}
                onClick={() => setTab("comments")}
              >
                <MessageSquare size={14} /> {t("Comments")}{" "}
                <span>{comments.length}</span>
              </button>
              <button
                className={tab === "activity" ? "active" : ""}
                onClick={() => setTab("activity")}
              >
                {t("Activity")}
              </button>
            </div>
            {loadingDiscussion ? (
              <Spinner />
            ) : discussionError ? (
              <p className="form-error" role="alert">
                {t(
                  "Couldn’t load the discussion. Close and reopen this task to retry.",
                )}
              </p>
            ) : tab === "comments" ? (
              <>
                <div className="comment-list">
                  {comments.length >= 500 && (
                    <p className="muted small">
                      {t("Showing the 500 most recent comments.")}
                    </p>
                  )}
                  {comments.length === 0 && (
                    <p className="muted small">
                      {t(
                        "The conversation starts with you. Share an update or ask a question.",
                      )}
                    </p>
                  )}
                  {comments.map((c) => {
                    const m = data.members.find((m) => m.email === c.author);
                    return (
                      <article className="comment" key={c.id}>
                        <Avatar
                          small
                          name={m?.name || c.author}
                          color={m?.color}
                        />
                        <div>
                          <div className="comment-meta">
                            <strong>{m?.name || c.author}</strong>
                            <time>{relativeTime(new Date(c.createdAt))}</time>
                          </div>
                          <p>{c.body}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <form className="comment-form" onSubmit={postComment}>
                  <label className="sr-only" htmlFor="comment-body">
                    {t("Comment")}
                  </label>
                  <textarea
                    id="comment-body"
                    placeholder={t("Share an update…")}
                    rows={2}
                    maxLength={5000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <button
                    className="button primary"
                    disabled={!comment.trim() || commenting}
                    type="submit"
                  >
                    {commenting ? <Spinner /> : <Send size={14} />}
                    {t("Post comment")}
                  </button>
                </form>
              </>
            ) : (
              <div className="task-activity">
                {activities.length === 0 ? (
                  <p className="muted small">
                    {t("Changes to this task will appear here.")}
                  </p>
                ) : (
                  activities.map((a) => (
                    <p key={a.id}>
                      <strong>
                        {data.members.find((m) => m.email === a.actor)?.name ||
                          a.actor}
                      </strong>{" "}
                      {eventMessage(a.message, locale)}
                      <time>{relativeTime(new Date(a.createdAt))}</time>
                    </p>
                  ))
                )}
              </div>
            )}
          </section>
        )}
      </div>
      <footer className="task-editor-footer">
        <div className="task-editor-feedback">
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          {!error && (
            <span className="task-draft-status" role="status">
              {attachmentBusy
                ? "Uploading attachments…"
                : attachmentBlocked
                  ? "Retry or remove failed attachments before creating this task."
                  : task
                    ? dirty
                      ? draftSaved
                        ? "Draft saved on this browser"
                        : "Unsaved changes"
                      : "Your task is up to date"
                    : dirty
                      ? draftSaved
                        ? "Draft saved on this browser"
                        : t("Unsaved changes")
                      : t("Only a title is required")}
            </span>
          )}
        </div>
        <div className="task-editor-actions">
          {task ? (
            <button
              type="button"
              className="button subtle editor-archive"
              disabled={
                saving ||
                commenting ||
                (data.settings?.configuration?.readOnly && !data.actor.isAdmin)
              }
              onClick={archive}
            >
              <Archive size={16} />
              {task.archived ? t("Restore") : t("Archive")}
            </button>
          ) : (
            <label className="create-another">
              <input
                type="checkbox"
                checked={createAnother}
                disabled={saving}
                onChange={(e) => setCreateAnother(e.target.checked)}
              />
              {t("Create another")}
            </label>
          )}
          <div className="task-editor-submit">
            <button
              type="button"
              className="button secondary"
              disabled={saving || commenting || attachmentBusy}
              onClick={requestClose}
            >
              {!task && dirty ? t("Save draft & close") : t("Cancel")}
            </button>
            <button
              className="button primary"
              form="task-editor-form"
              type="submit"
              disabled={
                saving ||
                commenting ||
                attachmentBusy ||
                attachmentBlocked ||
                (data.settings?.configuration?.readOnly && !data.actor.isAdmin)
              }
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              {saving ? <Spinner /> : <Check size={16} />}
              {saving
                ? t("Saving…")
                : task
                  ? t("Save changes")
                  : t("Create task")}
              <kbd aria-hidden="true">
                {typeof navigator !== "undefined" &&
                /Mac|iPhone|iPad/.test(navigator.platform)
                  ? "⌘ ↵"
                  : "Ctrl ↵"}
              </kbd>
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}
