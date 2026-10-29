"use client";
import {
  PurposeSelect,
  DocumentLabel,
  DownloadDocuments,
} from "../document-controls";
import type { DocumentPurpose } from "@/lib/document-model";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatFileSize } from "@/lib/file-management-model";
import { RelatedRoomProjects } from "../related-room-projects";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, ExternalLink, Upload } from "lucide-react";
import { TransferProgress, useFileDownload } from "../file-transfers";
import { uploadAttachment, type TransferPhase } from "@/lib/file-transfer";
import {
  documentStatus,
  type BoardProject,
  type BoardDetail,
} from "@/lib/board-room/model";
import { boardGet, boardRequest } from "./api";
import { BoardModal } from "./modal";
import { stageNeedsReason } from "@/lib/board-room/health";
import { DocumentVersions } from "../connected/document-versions";
import { ProjectHub, type HubTab } from "../connected/hub";
import { useURLState } from "../connected/url-state";
import { ProjectCostsPanel } from "./costs-workspace";
import { ProjectTemplateDetails } from "../project-template-fields";
import { ProjectStoryline } from "../connected/project-storyline";
import {
  DocumentDateProvider,
  DocumentDateInput,
  DocumentDateControl,
} from "../document-date";
import { ProgressReview } from "./review-controls";
export function StageTrack({
  project,
  stages,
  admin,
  onChange,
}: {
  project: BoardProject;
  stages: string[];
  admin: boolean;
  onChange: (
    p: BoardProject,
    stage: number,
    completed?: boolean,
    reason?: string,
  ) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<{
    stage: number;
    completed: boolean;
  } | null>(null);
  const [reason, setReason] = useState("");
  async function set(
    stage: number,
    completed = false,
    confirmedReason?: string,
  ) {
    if (project.stage === stage && project.completed === completed) return;
    if (
      stageNeedsReason(project.stage, stage, project.completed, completed) &&
      !confirmedReason
    ) {
      setTarget({ stage, completed });
      setReason("");
      return;
    }
    setSaving(true);
    try {
      const result = await onChange(project, stage, completed, confirmedReason);
      if (result) setTarget(null);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <div
        className="br-stage-track"
        aria-label={`${project.name} stage progress`}
      >
        {stages.map((name, i) => (
          <button
            key={i}
            disabled={!admin || saving}
            className={
              project.completed || i + 1 < project.stage
                ? "done"
                : i + 1 === project.stage
                  ? "current"
                  : ""
            }
            aria-label={`Set ${project.name} to stage ${i + 1}: ${name}`}
            aria-current={i + 1 === project.stage ? "step" : undefined}
            onClick={() => void set(i + 1)}
          >
            <b>
              {project.completed || i + 1 < project.stage
                ? "✓"
                : String(i + 1).padStart(2, "0")}
            </b>
            <span>{name}</span>
          </button>
        ))}
      </div>
      {target && (
        <form
          className="br-stage-reason"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim())
              void set(target.stage, target.completed, reason.trim());
          }}
        >
          <label>
            Reason for stage{" "}
            {target.stage < project.stage ||
            (project.completed && !target.completed)
              ? "reversal"
              : "jump"}
            <textarea
              autoFocus
              disabled={saving}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              required
              rows={2}
            />
          </label>
          <div>
            <button
              type="button"
              disabled={saving}
              onClick={() => setTarget(null)}
            >
              Cancel stage change
            </button>
            <button className="br-primary" disabled={saving || !reason.trim()}>
              Apply stage change
            </button>
          </div>
        </form>
      )}
      <div className="br-track-foot">
        <span>
          {project.completed
            ? "Completed"
            : project.stage
              ? `Stage ${project.stage} of 10`
              : "Not started"}
        </span>
        {admin && (
          <div>
            <button
              disabled={saving || project.stage === 0}
              onClick={() => void set(0)}
            >
              Reset progress
            </button>
            {project.stage === 10 && !project.completed && (
              <button disabled={saving} onClick={() => void set(10, true)}>
                Mark project complete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export function ProjectDetail({
  id,
  initialDetail,
  revision,
  admin,
  stages,
  onClose,
  onEdit,
  onChanged,
  onProgress,
  initialTab = "overview",
  showTasks = true,
}: {
  initialTab?: HubTab;
  showTasks?: boolean;
  id: string;
  initialDetail?: BoardDetail;
  revision: number;
  admin: boolean;
  stages: string[];
  onClose: () => void;
  onEdit: (p: BoardProject) => void;
  onChanged: () => Promise<void>;
  onProgress: (
    p: BoardProject,
    stage: number,
    completed?: boolean,
    reason?: string,
  ) => Promise<BoardProject | undefined>;
}) {
  const router = useRouter();
  const [hubTab, setHubTab] = useURLState<HubTab>(
    "projectTab",
    !showTasks && initialTab === "tasks" ? "overview" : initialTab,
    (value) =>
      [
        "overview",
        "assets",
        "costs",
        "documents",
        "storyline",
        "activity",
        ...(showTasks ? ["tasks"] : []),
      ].includes(String(value)),
  );
  const [undo, setUndo] = useState<{
    before: BoardProject;
    after: BoardProject;
  } | null>(null);
  const [detail, setDetail] = useState<BoardDetail | null>(
      initialDetail ?? null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const [detailStale, setDetailStale] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const dirty = !!(reviewNote || progressNote);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function requestLeave(next: () => void) {
    if (busy) return;
    if (dirty) setDiscardAction(() => next);
    else next();
  }
  const [documentDate, setDocumentDate] = useState("");
  const [purpose, setPurpose] = useState<DocumentPurpose | "">("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<TransferPhase>("preparing");
  const [removing, setRemoving] = useState<string | null>(null);
  const initialSnapshot = useRef(initialDetail ? { id, revision } : null);
  const uploadAbort = useRef<AbortController | null>(null);
  const download = useFileDownload();
  useEffect(() => () => uploadAbort.current?.abort(), []);
  async function addFile(file: File) {
    if (busy) return;
    if (!purpose) {
      setError("Choose a document purpose before uploading.");
      return;
    }
    const abort = new AbortController();
    uploadAbort.current = abort;
    setBusy(true);
    setError("");
    setProgress(0);
    setPhase("preparing");
    setUploadFile(file);
    try {
      await uploadAttachment(file, "boardRoomProject", id, setProgress, {
        signal: abort.signal,
        onPhase: setPhase,
        purpose: purpose || undefined,
        documentDate: documentDate || null,
      });
      toast.success("Document uploaded");
      await reload();
      await onChanged();
    } catch (e) {
      setPhase(abort.signal.aborted ? "cancelled" : "error");
      if (!abort.signal.aborted) setError((e as Error).message);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: AbortController | undefined;
    const refreshDocuments = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        abort?.abort();
        abort = new AbortController();
        boardGet<BoardDetail>(new URLSearchParams({ id }), abort.signal)
          .then(setDetail)
          .catch((error) => {
            if (error.name !== "AbortError") {
              setDetailStale(true);
              setError("Project details may be stale. " + error.message);
            }
          });
      }, 200);
    };
    window.addEventListener("evolve:changed", refreshDocuments);
    return () => {
      clearTimeout(timer);
      abort?.abort();
      window.removeEventListener("evolve:changed", refreshDocuments);
    };
  }, [id]);
  async function reload() {
    const data = await boardGet<BoardDetail>(new URLSearchParams({ id }));
    setDetail(data);
    setDetailStale(false);
    return data;
  }
  useEffect(() => {
    if (
      initialSnapshot.current?.id === id &&
      initialSnapshot.current.revision === revision
    )
      return;
    const controller = new AbortController();
    boardGet<BoardDetail>(new URLSearchParams({ id }), controller.signal)
      .then(setDetail)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [id, revision]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await reload();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <BoardModal
      title={
        discardAction
          ? "Discard unsaved review notes?"
          : (detail?.project.name ?? "Project details")
      }
      onClose={() =>
        discardAction ? setDiscardAction(null) : requestLeave(onClose)
      }
    >
      <DocumentDateProvider>
        {discardAction && (
          <div className="br-dialog-body">
            <p>
              Your review notes have not been submitted. Discard them to
              continue?
            </p>
            <div className="br-document-actions">
              <button autoFocus onClick={() => setDiscardAction(null)}>
                Keep editing
              </button>
              <button
                className="br-primary"
                onClick={() => {
                  const next = discardAction;
                  setDiscardAction(null);
                  setReviewNote("");
                  setProgressNote("");
                  next();
                }}
              >
                Discard notes
              </button>
            </div>
          </div>
        )}
        <div hidden={!!discardAction}>
          {error && (
            <p className="br-error" role="alert">
              {error}
            </p>
          )}
          {detailStale && (
            <button
              onClick={() =>
                void reload().catch((e) => setError((e as Error).message))
              }
            >
              Refresh project details
            </button>
          )}
          {!detail ? (
            <p className="br-dialog-body">Loading project…</p>
          ) : (
            <div className="br-dialog-body">
              <ProjectHub
                showTasks={showTasks}
                id={id}
                tab={hubTab}
                onTab={setHubTab}
              />
              <div hidden={hubTab !== "overview"}>
                <div className="br-detail-heading">
                  <div>
                    <span
                      className="br-status"
                      data-state={documentStatus(detail.project)}
                    >
                      {detail.project.valid ? "✓ " : ""}
                      {documentStatus(detail.project)}
                    </span>
                    <p>
                      {detail.project.externalId} · {detail.project.category} ·{" "}
                      {detail.project.location || "Location not set"}
                    </p>
                  </div>
                  {admin && (
                    <button
                      disabled={busy}
                      onClick={() => requestLeave(() => onEdit(detail.project))}
                    >
                      Edit project
                    </button>
                  )}
                </div>
                <div className="br-metadata">
                  <span>
                    <small>Capacity</small>
                    <b>
                      {detail.project.capacity === null
                        ? "Not set"
                        : `${detail.project.capacity.toLocaleString("en-US")} ${detail.project.unit}`}
                    </b>
                  </span>
                  <span>
                    <small>Voltage</small>
                    <b>{detail.project.voltage || "Not set"}</b>
                  </span>
                  <span>
                    <small>Planned years</small>
                    <b>
                      {detail.project.startYear ?? "—"} –{" "}
                      {detail.project.codYear ?? "Not set"}
                    </b>
                  </span>
                  <span>
                    <small>Last updated</small>
                    <b>
                      {new Date(detail.project.updatedAt).toLocaleString(
                        "en-GB",
                      )}
                    </b>
                  </span>
                </div>
                {detail.project.description && (
                  <p className="br-description">{detail.project.description}</p>
                )}
                <StageTrack
                  project={detail.project}
                  stages={stages}
                  admin={admin && !detailStale}
                  onChange={async (p, s, c, reason) => {
                    const result = await onProgress(p, s, c, reason);
                    if (result) setUndo({ before: p, after: result });
                    await reload();
                    return result;
                  }}
                />
                {undo && admin && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await boardRequest({
                          action: "progress",
                          id: undo.before.id,
                          version: undo.after.version,
                          stage: undo.before.stage,
                          completed: undo.before.completed,
                          reason: "Undo previous stage change.",
                        });
                        setUndo(null);
                        toast.success("Progress restored");
                      })
                    }
                  >
                    Undo progress
                  </button>
                )}
                <ProgressReview
                  key={`progress-${detail.project.id}`}
                  project={detail.project}
                  admin={admin}
                  busy={busy}
                  action={action}
                  note={progressNote}
                  onNoteChange={setProgressNote}
                />
                <h3>Project links</h3>
                <div className="br-links">
                  {detail.project.links.map((url, i) => (
                    <a
                      key={`${url}-${i}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={13} />
                      {detail.project.linkLabels?.[i] || new URL(url).hostname}
                    </a>
                  ))}
                  {!detail.project.links.length && <p>No links added.</p>}
                </div>
                <RelatedRoomProjects
                  room="board"
                  id={id}
                  revision={detail.project.version}
                  onNavigate={(href) => requestLeave(() => router.push(href))}
                />
              </div>
              <section
                hidden={hubTab !== "documents"}
                aria-label="Project documents"
              >
                <h3>
                  Documents <small>{detail.project.fileCount}</small>
                </h3>
                <p className="br-note">
                  Private files. A ready-file change returns the project to
                  Needs review. Validity is an admin review decision, separate
                  from project stage.
                </p>
                <DownloadDocuments
                  request={{ kind: "project", room: "board", id }}
                />
                {admin && (
                  <div className="br-document-actions">
                    <PurposeSelect
                      value={purpose}
                      onChange={setPurpose}
                      disabled={busy}
                      label="Upload document purpose"
                    />
                    <DocumentDateInput
                      value={documentDate}
                      onChange={setDocumentDate}
                      disabled={busy}
                      label="Upload document date"
                    />
                    <label className="br-upload">
                      <Upload size={14} />
                      Upload document
                      <input
                        aria-label="Upload project document"
                        type="file"
                        disabled={busy}
                        accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void addFile(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}
                {detail.attachments.map((f) => (
                  <div className="br-document" key={f.id}>
                    <FileText size={18} />
                    <div>
                      <a
                        href={`/api/attachments/${f.id}/content`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {f.filename}
                      </a>
                      <small>
                        {formatFileSize(f.size)} · {f.ownerEmail}
                      </small>
                    </div>
                    <DocumentDateControl
                      file={f}
                      editable={admin && !busy}
                      onChanged={(updated) => {
                        setDetail((current) =>
                          current
                            ? {
                                ...current,
                                attachments: current.attachments.map((file) =>
                                  file.id === updated.id ? updated : file,
                                ),
                              }
                            : current,
                        );
                      }}
                    />
                    <DocumentVersions
                      file={f}
                      entityType="boardRoomProject"
                      entityId={id}
                      editable={admin}
                      admin={admin}
                      onChanged={async (updated) => {
                        if (updated)
                          setDetail((current) =>
                            current
                              ? {
                                  ...current,
                                  project: {
                                    ...current.project,
                                    valid: false,
                                    reviewedRevision: null,
                                    reviewedBy: null,
                                    reviewedAt: null,
                                  },
                                  attachments: [
                                    updated,
                                    ...current.attachments.filter(
                                      (a) =>
                                        a.id !== f.id &&
                                        a.documentId !== updated.documentId,
                                    ),
                                  ],
                                }
                              : current,
                          );
                        try {
                          await reload();
                          await onChanged();
                        } catch (e) {
                          setDetailStale(true);
                          setError(
                            `Document saved. Refresh project details before reviewing: ${(e as Error).message}`,
                          );
                        }
                      }}
                    />
                    <DocumentLabel
                      file={f}
                      editable={admin && !busy}
                      onChanged={(updated) => {
                        setDetail((current) =>
                          current
                            ? {
                                ...current,
                                attachments: current.attachments.map((file) =>
                                  file.id === updated.id ? updated : file,
                                ),
                              }
                            : current,
                        );
                        void onChanged().catch((error) =>
                          setError(
                            `Document label saved. Dashboard refresh failed: ${(error as Error).message}`,
                          ),
                        );
                      }}
                    />
                    <button
                      disabled={download.busy}
                      onClick={() => void download.download(f)}
                      aria-label={`Download ${f.filename}`}
                    >
                      Download
                    </button>
                    {admin && (
                      <button disabled={busy} onClick={() => setRemoving(f.id)}>
                        Remove
                      </button>
                    )}
                    {removing === f.id && (
                      <div
                        className="attachment-confirm"
                        role="group"
                        aria-label="Confirm attachment deletion"
                      >
                        <span>Delete this document?</span>
                        <button onClick={() => setRemoving(null)}>
                          Cancel
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const r = await fetch(
                                `/api/attachments/${f.id}`,
                                {
                                  method: "DELETE",
                                },
                              );
                              const body = await r.json();
                              if (!r.ok) throw Error(body.error);
                              setRemoving(null);
                              toast.success("Document removed");
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!detail.attachments.length && (
                  <p className="br-empty-small">
                    No documents yet.{" "}
                    {admin
                      ? "Upload a project document to keep its evidence here."
                      : "An administrator can add project documents here."}{" "}
                    PDF, Office, text and images · up to 25 MB per document.
                  </p>
                )}
                {detail.project.documentReviewNote && (
                  <p className="br-review-note">
                    {detail.project.documentReviewNote}
                  </p>
                )}
                {admin && (
                  <label className="br-review-note-field">
                    Document review note
                    <textarea
                      disabled={busy}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      maxLength={1000}
                      rows={2}
                      placeholder="Record the evidence reviewed or explain why validity was revoked."
                    />
                  </label>
                )}
                {admin && (
                  <div className="br-document-actions">
                    <button
                      className="br-primary"
                      disabled={
                        busy ||
                        detailStale ||
                        (!detail.project.valid &&
                          detail.project.fileCount === 0)
                      }
                      onClick={() =>
                        void action(async () => {
                          await boardRequest({
                            action: "review",
                            id,
                            version: detail.project.version,
                            documentRevision: detail.project.documentRevision,
                            valid: !detail.project.valid,
                            note: reviewNote.trim(),
                          });
                          setReviewNote("");
                          toast.success(
                            detail.project.valid
                              ? "Validity revoked"
                              : "Project marked valid",
                          );
                        })
                      }
                    >
                      {detail.project.valid
                        ? "Revoke validity"
                        : "Mark project valid"}
                    </button>
                  </div>
                )}
                {uploadFile && (
                  <TransferProgress
                    direction="upload"
                    filename={uploadFile.name}
                    size={uploadFile.size}
                    progress={progress}
                    phase={phase}
                    onCancel={() => uploadAbort.current?.abort()}
                    error={phase === "error" ? error : undefined}
                  />
                )}
                {download.view}
                {detail.project.reviewedBy && (
                  <p className="br-note">
                    Reviewed by {detail.project.reviewedBy}
                    {detail.project.reviewedAt
                      ? ` · ${new Date(detail.project.reviewedAt).toLocaleString("en-GB")}`
                      : ""}
                  </p>
                )}
              </section>
              {hubTab === "overview" && <ProjectTemplateDetails id={id} />}
              {hubTab === "costs" && (
                <ProjectCostsPanel key={id} id={id} admin={admin} />
              )}
              {hubTab === "storyline" && (
                <a href={"/board-room?section=storyline&storyProject=" + id}>
                  Open dedicated Storyline
                </a>
              )}
              {hubTab === "storyline" && (
                <ProjectStoryline key={id} projectId={id} admin={admin} />
              )}
              <section hidden={hubTab !== "activity"}>
                <h3>Recent history</h3>
                <ol className="br-history">
                  {detail.history.map((h) => (
                    <li key={h.id}>
                      <b>{h.kind.replaceAll("_", " ")}</b>
                      {h.detail &&
                      typeof h.detail === "object" &&
                      ("note" in h.detail || "reason" in h.detail) ? (
                        <p>
                          {String(
                            (h.detail as { note?: string; reason?: string })
                              .note ||
                              (h.detail as { reason?: string }).reason ||
                              "",
                          )}
                        </p>
                      ) : null}
                      <small>
                        {h.actor} ·{" "}
                        {new Date(h.createdAt).toLocaleString("en-GB")}
                      </small>
                    </li>
                  ))}
                </ol>
              </section>
              <Link
                className="br-note"
                href={`/board-room/projects/${id}`}
                onNavigate={(event) => {
                  event.preventDefault();
                  requestLeave(() => router.push(`/board-room/projects/${id}`));
                }}
              >
                Open this project’s shareable page
              </Link>
            </div>
          )}
        </div>
      </DocumentDateProvider>
    </BoardModal>
  );
}
