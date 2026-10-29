"use client";
import { PurposeSelect } from "./document-controls";
import type { DocumentPurpose } from "@/lib/document-model";
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus, RotateCcw, X } from "lucide-react";
import type { AttachmentInfo } from "@/lib/attachment-types";
import { uploadAttachment } from "./attachments";
import { TransferProgress } from "./file-transfers";
import type { TransferPhase } from "@/lib/file-transfer";

type FailedFile = { id: string; file: File; error: string };
export function DraftAttachments({
  draftId,
  value,
  onChange,
  onBusy,
  onBlocked,
  demo,
}: {
  draftId: string;
  value: AttachmentInfo[];
  onChange: (items: AttachmentInfo[]) => void;
  onBusy: (busy: boolean) => void;
  onBlocked: (blocked: boolean) => void;
  demo: boolean;
}) {
  const [purpose, setPurpose] = useState<DocumentPurpose | "">("");
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    abort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<TransferPhase>("preparing"),
    [size, setSize] = useState(0);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [filename, setFilename] = useState(""),
    [error, setError] = useState(""),
    [failed, setFailed] = useState<FailedFile[]>([]),
    [dragging, setDragging] = useState(false);
  useEffect(() => () => abort.current?.abort(), []);
  async function add(files: File[], remaining: FailedFile[] = failed) {
    if (lock.current || demo || !files.length) return;
    if (!purpose) {
      setError("Choose a document purpose before uploading.");
      return;
    }
    if (value.length + remaining.length + files.length > 10) {
      setError("Attach up to 10 files per task draft.");
      return;
    }
    lock.current = true;
    abort.current = new AbortController();
    setBusy(true);
    onBusy(true);
    setError("");
    const ready = [...value],
      errors = [...remaining];
    setFailed(remaining);
    try {
      for (const file of files) {
        setFilename(file.name);
        setSize(file.size);
        setProgress(0);
        try {
          const item = await uploadAttachment(
            file,
            "taskDraft",
            draftId,
            setProgress,
            {
              signal: abort.current?.signal,
              onPhase: setPhase,
              purpose: purpose || undefined,
            },
          );
          ready.push(item);
          onChange([...ready]);
        } catch (error) {
          errors.push({
            id: crypto.randomUUID(),
            file,
            error: abort.current?.signal.aborted
              ? "Upload cancelled. Retry or remove this file."
              : error instanceof Error
                ? error.message
                : "Upload failed. Please try again.",
          });
        }
      }
      setFailed(errors);
      onBlocked(errors.length > 0);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
      setFilename("");
    }
  }
  async function remove(item: AttachmentInfo) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/attachments/${item.id}?draftId=${draftId}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) {
        const body = await response.json();
        throw new Error(body.error || "This file could not be removed.");
      }
      onChange(value.filter((file) => file.id !== item.id));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This file could not be removed.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section
      id="task-draft-attachments"
      className="draft-attachments"
      aria-label="Task draft attachments"
    >
      <PurposeSelect
        value={purpose}
        onChange={setPurpose}
        disabled={busy || demo}
        label="Draft document purpose"
      />
      <header>
        <div>
          <h2>
            <Paperclip size={17} />
            Attachments <span>{value.length}</span>
          </h2>
          <p>
            {demo
              ? "Sign in to attach files when creating a task."
              : "Only you can open draft files. Your administrator can manage file details and remove uploads. Files are shared with your team when you create the task."}
          </p>
        </div>
        <button
          type="button"
          className="button secondary small-button"
          disabled={demo || busy || value.length + failed.length >= 10}
          onClick={() => input.current?.click()}
        >
          <Plus size={15} />
          Add attachments
        </button>
      </header>
      {!demo && (
        <div
          className="attachment-dropzone"
          data-dragging={dragging}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void add([...event.dataTransfer.files]);
          }}
        >
          <FileText size={21} />
          <p>Drop files here or use Add attachments.</p>
          <small>
            PDF, Office documents, text, PNG, JPEG or WebP · up to 25 MB each ·
            10 files
          </small>
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        aria-label="Choose task attachments"
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          const files = [...(event.target.files || [])];
          event.target.value = "";
          void add(files);
        }}
      />
      {busy && filename && (
        <TransferProgress
          direction="upload"
          filename={filename || "attachment"}
          size={size}
          progress={progress}
          phase={phase}
          onCancel={() => abort.current?.abort()}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="draft-file-list">
        {value.map((item) => (
          <li key={item.id}>
            <FileText size={17} />
            <span>
              <a
                href={`/api/attachments/${item.id}/content`}
                target="_blank"
                rel="noreferrer"
              >
                {item.filename}
              </a>
              <small>
                {item.size < 1024
                  ? `${item.size} B`
                  : `${(item.size / 1024).toLocaleString("en-US", {
                      maximumFractionDigits: 1,
                    })} KB`}{" "}
                · Ready to attach
              </small>
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${item.filename}`}
              disabled={busy}
              onClick={() => void remove(item)}
            >
              <X size={15} />
            </button>
          </li>
        ))}
        {failed.map((item) => (
          <li key={item.id} className="failed-draft-file">
            <FileText size={17} />
            <span>
              <strong>{item.file.name}</strong>
              <small role="alert">{item.error}</small>
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Retry ${item.file.name}`}
              disabled={busy}
              onClick={() =>
                void add(
                  [item.file],
                  failed.filter((file) => file.id !== item.id),
                )
              }
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label={`Remove failed ${item.file.name}`}
              onClick={() => {
                const next = failed.filter((file) => file.id !== item.id);
                setFailed(next);
                onBlocked(next.length > 0);
              }}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      {!demo && (
        <p className="field-help">
          Draft uploads are available for 24 hours. Retry or remove failed
          uploads before creating the task.
        </p>
      )}
    </section>
  );
}
