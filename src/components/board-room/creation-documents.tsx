"use client";
import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
} from "react";
import { FileText, Paperclip, Upload, X } from "lucide-react";
import { DocumentDateInput } from "../document-date";
import { PurposeSelect } from "../document-controls";
import { TransferProgress } from "../file-transfers";
import { uploadAttachment, type TransferPhase } from "@/lib/file-transfer";
import { formatFileSize } from "@/lib/file-management-model";
import type { DocumentPurpose } from "@/lib/document-model";
type Entry = {
  key: string;
  file: File;
  purpose: DocumentPurpose | "";
  documentDate: string;
  status: "selected" | "ready" | "failed" | "cancelled";
  error?: string;
};
export type CreationDocumentsHandle = {
  validate: () => string | null;
  upload: (projectId: string) => Promise<boolean>;
};
export const CreationDocuments = forwardRef<
  CreationDocumentsHandle,
  { busy: boolean; onPending: (pending: boolean) => void; onDirty: () => void }
>(function CreationDocuments({ busy, onPending, onDirty }, ref) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [active, setActive] = useState<{ index: number; file: File } | null>(null),
    [phase, setPhase] = useState<TransferPhase>("preparing"),
    [progress, setProgress] = useState(0);
  const abort = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function update(next: Entry[]) {
    setEntries(next);
    onPending(next.some((e) => e.status !== "ready"));
  }
  function choose(files: File[]) {
    if (busy) return;
    const invalid = files.find(
      (f) =>
        f.size <= 0 ||
        f.size > 25 * 1024 * 1024 ||
        !/^.+\.(pdf|docx|xlsx|pptx|txt|png|jpe?g|webp)$/i.test(f.name),
    );
    if (entries.length + files.length > 10) {
      setError("Select up to 10 project documents.");
      return;
    }
    if (invalid) {
      setError(`${invalid.name}: choose a supported document up to 25 MB.`);
      return;
    }
    setError("");
    update([
      ...entries,
      ...files.map((file) => ({
        key: crypto.randomUUID(),
        file,
        purpose: "" as const,
        documentDate: "",
        status: "selected" as const,
      })),
    ]);
    if (files.length) onDirty();
  }
  useImperativeHandle(ref, () => ({
    validate: () =>
      entries.some((e) => e.status !== "ready" && !e.purpose)
        ? "Choose a purpose for every selected document."
        : null,
    upload: async (projectId) => {
      const queue = [...entries];
      const controller = new AbortController();
      abort.current = controller;
      setError("");
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].status === "ready") continue;
        if (controller.signal.aborted) break;
        const entry = queue[i];
        setActive({ index: i, file: entry.file });
        setProgress(0);
        setPhase("preparing");
        try {
          await uploadAttachment(
            entry.file,
            "boardRoomProject",
            projectId,
            setProgress,
            {
              signal: controller.signal,
              onPhase: setPhase,
              purpose: entry.purpose || undefined,
              documentDate: entry.documentDate || null,
            },
          );
          queue[i] = { ...entry, status: "ready", error: undefined };
        } catch (e) {
          queue[i] = {
            ...entry,
            status: controller.signal.aborted ? "cancelled" : "failed",
            error: controller.signal.aborted
              ? "Upload cancelled. Resume or remove this document."
              : (e as Error).message,
          };
          setPhase(controller.signal.aborted ? "cancelled" : "error");
        }
        update([...queue]);
      }
      return queue.every((e) => e.status === "ready");
    },
  }));
  return (
    <section
      className="creation-documents br-wide"
      aria-label="Project documents"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        choose(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="section-heading">
        <h3>
          <Paperclip size={17} /> Documents{" "}
          <span className="count-badge">{entries.length}</span>
        </h3>
        <button
          type="button"
          className="button secondary"
          disabled={busy || entries.length >= 10}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} /> Add documents
        </button>
      </header>
      <p className="field-help">
        Optional. Choose documents now; uploads start after the project is
        created. PDF, Office, text and images · 25 MB each · up to 10 files.
      </p>
      <input
        hidden
        ref={input}
        aria-label="Choose project documents"
        type="file"
        multiple
        disabled={busy}
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          choose(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {!entries.length && (
        <p className="upload-dropzone">
          Drop documents here or choose Add documents.
        </p>
      )}
      <ul className="creation-document-list">
        {entries.map((entry) => (
          <li key={entry.key}>
            <FileText size={19} />
            <div className="creation-document-name">
              <strong>{entry.file.name}</strong>
              <small>
                {formatFileSize(entry.file.size)} ·{" "}
                {entry.status === "ready"
                  ? "Uploaded"
                  : entry.status === "selected"
                    ? "Waiting to upload"
                    : entry.status}
              </small>
              {entry.error && (
                <p role="alert" className="form-error">
                  {entry.error}
                </p>
              )}
            </div>
            <PurposeSelect
              label={`Purpose for ${entry.file.name}`}
              value={entry.purpose}
              disabled={busy || entry.status === "ready"}
              onChange={(purpose) => {
                update(
                  entries.map((e) =>
                    e.key === entry.key ? { ...e, purpose } : e,
                  ),
                );
                onDirty();
              }}
            />
            <DocumentDateInput
              value={entry.documentDate}
              disabled={busy || entry.status === "ready"}
              label={`Document date for ${entry.file.name}`}
              onChange={(documentDate) => {
                update(
                  entries.map((e) =>
                    e.key === entry.key ? { ...e, documentDate } : e,
                  ),
                );
                onDirty();
              }}
            />
            {entry.status !== "ready" && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${entry.file.name}`}
                disabled={busy}
                onClick={() => {
                  update(entries.filter((e) => e.key !== entry.key));
                  onDirty();
                }}
              >
                <X size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {active && (
        <>
          <p role="status">
            Document {active.index + 1} of {entries.length}
          </p>
          <TransferProgress
            direction="upload"
            filename={active.file.name}
            size={active.file.size}
            progress={progress}
            phase={phase}
            onCancel={() => abort.current?.abort()}
          />
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
});
