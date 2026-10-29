"use client";
import { AppSelect } from "./app-select";
import { type ProjectCostEditorHandle } from "./project-cost-editor";
import { LabelInput } from "./label-input";
import { type ProjectOptionsInputHandle } from "./project-options-input";
import { mergeLabels } from "@/lib/labels";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Modal, Spinner } from "./ui";
import { useI18n } from "./i18n-provider";
import {
  projectFields,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  projectCosts,
  projectCostOptions,
  PROJECT_CATEGORIES,
  PLANNED_COD_YEARS,
} from "@/lib/project-model";
import type { RunCommand } from "./workspace-types";
import type { Project, WorkspaceData } from "@/lib/types";
import {
  projectDraftKey,
  readProjectDraft,
  writeProjectDraft,
  removeProjectDraft,
  projectSubmissionFields,
} from "@/lib/project-composer";
const colors = ["violet", "blue", "green", "orange", "pink"] as const;
export function ProjectDialog({
  project,
  demo,
  data,
  run,
  onClose,
  costsOnly = false,
  onDocuments,
}: {
  project?: Project;
  costsOnly?: boolean;
  demo: boolean;
  data: WorkspaceData;
  run: RunCommand;
  onClose: () => void;
  onDocuments?: (id: string) => void;
}) {
  const draftKey = projectDraftKey(data.actor.email, demo);
  const [seed] = useState(() => ({
    ...projectFields.parse({
      name: "Draft",
      category: project?.category || null,
      plannedCodYear: project?.plannedCodYear ?? null,
      ...project,
      costOptions: projectCostOptions(
        project || {
          currency: data.settings?.configuration.defaultCurrency || "IDR",
        },
      ),
      costItems: projectCosts(
        project || {
          currency: data.settings?.configuration.defaultCurrency || "IDR",
        },
      ),
      currency:
        project?.currency ||
        data.settings?.configuration.defaultCurrency ||
        "IDR",
    }),
    name: project?.name || "",
  }));
  const [restored, setRestored] = useState(() =>
    project ? null : readProjectDraft(draftKey),
  );
  const [fields, setFields] = useState(() => {
    const initial = restored?.fields || seed;
    return {
      ...initial,
      costOptions: initial.costOptions ?? projectCostOptions(initial),
    };
  });
  const [pendingLabels, setPendingLabels] = useState("");
  const dirty =
    Boolean(pendingLabels.trim()) ||
    JSON.stringify(fields) !== JSON.stringify(seed);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [draftSaved, setDraftSaved] = useState(Boolean(restored));
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const costEditor = useRef<ProjectCostEditorHandle>(null);
  const optionsInput = useRef<ProjectOptionsInputHandle>(null);
  const request = useRef(
    restored?.request || { id: crypto.randomUUID(), fingerprint: "" },
  );
  const patch = (value: Partial<typeof fields>) => {
    setFields((current) => ({ ...current, ...value }));
    setDraftSaved(false);
  };
  const saveDraft = useCallback(() => {
    try {
      return writeProjectDraft(draftKey, {
        fields: {
          ...fields,
          labels: mergeLabels(fields.labels, pendingLabels),
        },
        request: request.current,
      });
    } catch {
      return false;
    }
  }, [draftKey, fields, pendingLabels]);
  function requestClose() {
    if (lock.current) return;
    if (!dirty || (!project && saveDraft())) onClose();
    else setConfirmDiscard(true);
  }
  useEffect(() => {
    if (project || !dirty) return;
    const timer = setTimeout(() => setDraftSaved(saveDraft()), 250);
    return () => clearTimeout(timer);
  }, [project, dirty, saveDraft]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!project && dirty) saveDraft();
      if (project && dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [project, dirty, saveDraft]);
  if (confirmDiscard)
    return (
      <Modal
        open
        onClose={() => setConfirmDiscard(false)}
        title="Discard project changes?"
        description="Your changes haven’t been saved."
      >
        <div className="task-discard-body">
          <p>
            Keep editing to save your work, or discard these changes and close
            the project.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              autoFocus
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                if (!project) removeProjectDraft(draftKey);
                onClose();
              }}
            >
              Discard changes
            </button>
          </div>
        </div>
      </Modal>
    );
  return (
    <Modal
      open
      onClose={requestClose}
      title={
        costsOnly
          ? "Project costs"
          : project
            ? "Project settings"
            : "Create a project"
      }
      description={
        costsOnly
          ? `${project?.name || "Project"} · Independent options and unit totals`
          : "Define the outcome, ownership, schedule, and cost for your project."
      }
      className="project-editor-modal"
      wide
    >
      <form
        id="project-details-form"
        className="standard-form project-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (lock.current) return;
          setError("");
          let labels: string[];
          try {
            labels = mergeLabels(fields.labels, pendingLabels);
          } catch {
            setError("Use up to 10 labels with at most 30 characters each.");
            return;
          }
          const parsed = projectSubmissionFields(
            {
              ...fields,
              labels,
            },
            request.current.fingerprint,
          );
          if (!parsed.success) {
            const issue = parsed.error.issues[0];
            if (issue.path[0] === "costOptions") {
              const option = fields.costOptions[Number(issue.path[1]) || 0];
              const field =
                issue.path[2] === "items"
                  ? `Cost ${(Number(issue.path[3]) || 0) + 1} ${String(issue.path[4] || "amount")}`
                  : "Option name";
              setError(
                `${option?.title || "Cost option"} · ${field}: ${issue.message}`,
              );
              if (issue.path[2] === "items")
                costEditor.current?.focusIssue(issue.path);
              else if (option) optionsInput.current?.focusName(option.id);
            } else setError(issue.message);
            return;
          }
          if (
            parsed.data.startDate &&
            parsed.data.targetDate &&
            parsed.data.targetDate < parsed.data.startDate
          ) {
            setError("Target date must be on or after the start date.");
            return;
          }
          lock.current = true;
          setSaving(true);
          try {
            const fingerprint = JSON.stringify(parsed.data);
            if (request.current.fingerprint !== fingerprint)
              request.current = { id: crypto.randomUUID(), fingerprint };
            const result = await run(
              project
                ? {
                    action: "updateProject",
                    id: project.id,
                    version: project.version || 1,
                    ...parsed.data,
                    costOptions: project ? projectCostOptions(project) : [],
                    costItems: project?.costItems ?? [],
                    budget: project?.budget ?? "0.00",
                    currency: project?.currency ?? fields.currency,
                  }
                : {
                    action: "createProject",
                    ...parsed.data,
                    costOptions: [],
                    costItems: [],
                    budget: "0.00",
                    currency: fields.currency,
                    idempotencyKey: request.current.id,
                  },
            );
            if (!project) removeProjectDraft(draftKey);
            const created = result.project as Project | undefined;
            toast.success(
              project ? "Project updated" : "Project created",
              !project && created && onDocuments
                ? {
                    action: {
                      label: "Add documents",
                      onClick: () => onDocuments(created.id),
                    },
                    duration: 12000,
                  }
                : undefined,
            );
            onClose();
          } catch (error) {
            setError((error as Error).message);
            if (!project) setDraftSaved(saveDraft());
          } finally {
            lock.current = false;
            setSaving(false);
          }
        }}
      >
        {!project && restored && dirty && (
          <div className="project-draft-notice">
            <span>Your unfinished project is restored.</span>
            <button
              type="button"
              onClick={() => {
                removeProjectDraft(draftKey);
                setFields({ ...seed, costOptions: seed.costOptions || [] });
                setPendingLabels("");
                setRestored(null);
                setDraftSaved(false);
                request.current = { id: crypto.randomUUID(), fingerprint: "" };
              }}
            >
              Discard draft
            </button>
          </div>
        )}
        <fieldset disabled={saving} className="project-form-fields">
          {!costsOnly && (
            <>
              <section className="form-section">
                <div className="form-section-heading">
                  <span>01</span>
                  <div>
                    <h3>Project essentials</h3>
                    <p>Make the purpose clear to everyone involved.</p>
                  </div>
                </div>
                <label>
                  Project name
                  <input
                    required
                    autoComplete="off"
                    maxLength={80}
                    placeholder="e.g. Kalimantan grid development plan"
                    value={fields.name}
                    onChange={(event) => patch({ name: event.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Describe the outcome, scope, and key deliverables."
                    value={fields.description}
                    onChange={(event) =>
                      patch({ description: event.target.value })
                    }
                  />
                </label>
                <div className="settings-field-grid project-planning-fields">
                  <label>
                    Planned COD
                    <AppSelect
                      aria-label="Planned COD"
                      value={fields.plannedCodYear?.toString() || ""}
                      onValueChange={(value) =>
                        patch({ plannedCodYear: value ? Number(value) : null })
                      }
                    >
                      <option value="">Not set</option>
                      {PLANNED_COD_YEARS.map((year) => (
                        <option key={year} value={year.toString()}>
                          {year}
                        </option>
                      ))}
                    </AppSelect>
                  </label>
                  <label>
                    Project category
                    <AppSelect
                      aria-label="Project category"
                      value={fields.category || ""}
                      onValueChange={(category) =>
                        patch({
                          category: (category ||
                            null) as typeof fields.category,
                        })
                      }
                    >
                      <option value="">Uncategorized</option>
                      {PROJECT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </AppSelect>
                  </label>
                </div>
                <div className="settings-field-grid">
                  <label>
                    Project reference
                    <input
                      maxLength={60}
                      placeholder="e.g. REN-2027-001"
                      value={fields.reference}
                      onChange={(event) =>
                        patch({ reference: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Location / system
                    <input
                      maxLength={160}
                      placeholder="e.g. Kalimantan interconnected system"
                      value={fields.location}
                      onChange={(event) =>
                        patch({ location: event.target.value })
                      }
                    />
                  </label>
                </div>
                <fieldset className="color-picker">
                  <legend>Project color</legend>
                  {colors.map((color) => (
                    <label
                      key={color}
                      className={`color-swatch color-${color}`}
                    >
                      <input
                        type="radio"
                        name="project-color"
                        value={color}
                        checked={fields.color === color}
                        onChange={() => patch({ color })}
                      />
                      <span className="sr-only">{color}</span>
                      {fields.color === color && <Check size={15} />}
                    </label>
                  ))}
                </fieldset>
                <LabelInput
                  value={fields.labels}
                  pending={pendingLabels}
                  onPendingChange={setPendingLabels}
                  onValueChange={(labels) => patch({ labels })}
                  data={data}
                  demo={demo}
                />
              </section>
              <section className="form-section">
                <div className="form-section-heading">
                  <span>02</span>
                  <div>
                    <h3>Ownership & schedule</h3>
                    <p>Set a clear owner and a realistic delivery window.</p>
                  </div>
                </div>
                <div className="settings-field-grid">
                  <label>
                    Project owner
                    <AppSelect
                      aria-label={"Project owner"}
                      value={fields.ownerEmail || ""}
                      onValueChange={(nextValue) =>
                        patch({ ownerEmail: nextValue || null })
                      }
                    >
                      <option value="">Unassigned</option>
                      {data.members
                        .filter(
                          (member) =>
                            !member.disabled ||
                            member.email === fields.ownerEmail,
                        )
                        .map((member) => (
                          <option key={member.email} value={member.email}>
                            {member.name}
                            {member.disabled ? " (deactivated)" : ""}
                          </option>
                        ))}
                    </AppSelect>
                  </label>
                  <label>
                    Project status
                    <AppSelect
                      aria-label={"Project status"}
                      value={fields.status}
                      onValueChange={(nextValue) =>
                        patch({
                          status: nextValue as typeof fields.status,
                        })
                      }
                    >
                      {PROJECT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {PROJECT_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </AppSelect>
                  </label>
                </div>
                <div className="settings-field-grid">
                  <label>
                    Start date
                    <input
                      type="date"
                      value={fields.startDate || ""}
                      onChange={(event) =>
                        patch({ startDate: event.target.value || null })
                      }
                    />
                  </label>
                  <label>
                    Target date
                    <input
                      type="date"
                      min={fields.startDate || undefined}
                      value={fields.targetDate || ""}
                      onChange={(event) =>
                        patch({ targetDate: event.target.value || null })
                      }
                    />
                  </label>
                </div>
              </section>
            </>
          )}
          <p className="field-hint">Project costs are managed in Board Room.</p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="project-draft-status" role="status">
        {dirty
          ? !project && draftSaved
            ? "Draft saved in this tab"
            : "Unsaved changes"
          : "Project details"}
      </div>
      <div className="form-actions project-form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={saving}
          onClick={requestClose}
        >
          {!project && dirty ? "Save draft & close" : "Cancel"}
        </button>
        <button
          className="button primary"
          type="submit"
          form="project-details-form"
          disabled={saving || !fields.name.trim()}
        >
          {saving ? <Spinner /> : <FolderPlus size={17} />}{" "}
          {project ? "Save changes" : "Create project"}
        </button>
      </div>
    </Modal>
  );
}

export function InviteDialog({
  run,
  onClose,
  demo = false,
}: {
  run: RunCommand;
  onClose: () => void;
  demo?: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState<{
    name: string;
    email: string;
    url: string | null;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await run({ action: "inviteMember", name, email });
      const member = result.member as
        { name: string; email: string } | undefined;
      setApproved({
        name: member?.name || name.trim(),
        email: member?.email || email.trim().toLowerCase(),
        url: demo
          ? null
          : typeof result.onboardingUrl === "string"
            ? result.onboardingUrl
            : null,
      });
      setCopyStatus("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const instructions = approved
    ? demo
      ? `Demo only: approval for ${approved.email} is simulated. No real workspace access was granted.`
      : `You have been approved to join Evolve.\nOpen ${approved.url || "the workspace sign-in page provided by your administrator"}.\nChoose Continue with Google and use exactly ${approved.email}.\nYour existing workspace permissions apply in Locker Room and Board Room. No invitation email is sent.`
    : "";
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Copied to clipboard.");
    } catch {
      setCopyStatus(
        "Copy unavailable. Select the text below and copy it manually.",
      );
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={
        approved
          ? demo
            ? "Demo approval"
            : "Teammate approved"
          : t("Better work, together")
      }
      description={
        approved
          ? "Share these instructions with the approved teammate."
          : t(
              "Approve a teammate’s Google email, then share your workspace link.",
            )
      }
    >
      {approved ? (
        <div className="invitation-handoff">
          <p>
            <strong>{approved.name}</strong>
            <br />
            {approved.email}
          </p>
          {!demo && (
            <p>Access is approved. No invitation email has been sent.</p>
          )}
          {!demo && !approved.url && (
            <p className="form-error" role="alert">
              The canonical sign-in link is unavailable. Ask the administrator
              to check the authentication origin.
            </p>
          )}
          <label>
            Sign-in link
            <input autoFocus readOnly value={approved.url || ""} />
          </label>
          <label>
            Onboarding instructions
            <textarea readOnly rows={6} value={instructions} />
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={!approved.url}
              onClick={() => approved.url && void copy(approved.url)}
            >
              Copy sign-in link
            </button>
            <button
              className="button secondary"
              onClick={() => void copy(instructions)}
            >
              Copy instructions
            </button>
          </div>
          {copyStatus && <p role="status">{copyStatus}</p>}
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => {
                setApproved(null);
                setName("");
                setEmail("");
                setCopyStatus("");
              }}
            >
              Add another
            </button>
            <button className="button primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="standard-form" onSubmit={submit}>
          <fieldset disabled={saving} className="invitation-fields">
            <label>
              {t("Full name")}
              <input
                required
                maxLength={80}
                placeholder={t("e.g. Maya Chen")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              {t("Google email address")}
              <input
                required
                type="email"
                placeholder="teammate@gmail.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          </fieldset>
          <div className="info-box">
            {t(
              "This grants member access to shared projects and tasks. Only the administrator can manage membership. No invitation email is sent.",
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary" disabled={saving}>
              {saving ? <Spinner /> : <Check size={15} />}{" "}
              {t("Approve teammate")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
