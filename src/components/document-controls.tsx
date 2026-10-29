"use client";
import { useState, useRef, useEffect } from "react";
import { AppSelect } from "./app-select";
import { TransferProgress } from "./file-transfers";
import { Modal } from "./ui";
import {
  DOCUMENT_PURPOSES,
  archiveParts,
  type DocumentPurpose,
  type ArchiveRequest,
  type ArchiveManifest,
} from "@/lib/document-model";
import { formatFileSize } from "@/lib/file-management-model";
import type { AttachmentInfo } from "@/lib/attachment-types";
import type { TransferPhase } from "@/lib/file-transfer";
export function PurposeSelect({
  value,
  onChange,
  disabled = false,
  label = "Document purpose",
}: {
  value: DocumentPurpose | "";
  onChange: (value: DocumentPurpose) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <AppSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as DocumentPurpose)}
    >
      <option value="" disabled>
        Select purpose…
      </option>
      {DOCUMENT_PURPOSES.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </AppSelect>
  );
}
export function DocumentLabel({
  file,
  editable,
  onChanged,
}: {
  file: AttachmentInfo;
  editable: boolean;
  onChanged: (file: AttachmentInfo) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!editable)
    return (
      <span className="document-purpose-badge">
        {file.purpose || "Unlabelled"}
      </span>
    );
  return (
    <div className="document-label-control">
      <AppSelect
        aria-label={`Purpose for ${file.filename}`}
        value={file.purpose || ""}
        disabled={busy}
        onValueChange={async (value) => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch(`/api/attachments/${file.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                purpose: value,
                expectedPurpose: file.purpose ?? null,
              }),
            });
            const body = await r.json();
            if (!r.ok)
              throw new Error(body.error || "Label could not be saved.");
            onChanged(body);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="" disabled>
          Unlabelled
        </option>
        {DOCUMENT_PURPOSES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </AppSelect>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function DownloadDocuments({
  request,
  label = "Download all documents",
  disabled = false,
}: {
  request: ArchiveRequest;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [manifest, setManifest] = useState<ArchiveManifest | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState<TransferPhase>("preparing"),
    [progress, setProgress] = useState(0),
    [partNumber, setPartNumber] = useState(0),
    [completed, setCompleted] = useState<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const parts = manifest ? archiveParts(manifest.files) : [];
  async function prepare() {
    abort.current?.abort();
    setBusy(false);
    setPhase("preparing");
    setProgress(0);
    setPartNumber(0);
    setOpen(true);
    setLoading(true);
    setError("");
    setManifest(null);
    setCompleted([]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const r = await fetch("/api/attachments/archive", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error || "Download could not be prepared.");
      archiveParts(body.files);
      if (abort.current === controller && !controller.signal.aborted)
        setManifest(body);
    } catch (e) {
      if (abort.current === controller && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (abort.current === controller) setLoading(false);
    }
  }
  async function download(index: number) {
    if (busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setPartNumber(index);
    setProgress(0);
    setPhase("downloading");
    setError("");
    try {
      const { buildDocumentArchive } =
        await import("@/lib/document-archive-client");
      const blob = await buildDocumentArchive(
        parts[index],
        (loaded, total) => {
          if (abort.current === controller)
            setProgress(total ? (loaded / total) * 100 : 0);
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (abort.current !== controller) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evolve-documents-part-${index + 1}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setCompleted((v) => [...new Set([...v, index])]);
      setPhase("complete");
    } catch (e) {
      if (abort.current !== controller) return;
      setPhase(controller.signal.aborted ? "cancelled" : "error");
      setError(
        controller.signal.aborted
          ? "Download cancelled. Retry this ZIP part when ready."
          : (e as Error).message,
      );
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={disabled}
        onClick={() => void prepare()}
      >
        {label}
      </button>
      {open && (
        <Modal
          open={open}
          title="Download documents"
          onClose={() => {
            abort.current?.abort();
            abort.current = null;
            setBusy(false);
            setLoading(false);
            setOpen(false);
          }}
        >
          <div className="document-download-dialog">
            {loading ? (
              <p role="status">Preparing document list…</p>
            ) : (
              manifest && (
                <>
                  <p>
                    {manifest.files.length} documents ·{" "}
                    {formatFileSize(manifest.bytes)} · {parts.length} ZIP{" "}
                    {parts.length === 1 ? "file" : "parts"}
                  </p>
                  <p className="field-help">
                    Organized by app and project, with a document index. Private
                    drafts and profile images are excluded. {manifest.excluded}{" "}
                    uploading or removing files excluded. Each part contains up
                    to 100 files or 100 MB.
                  </p>
                  {!parts.length && <p>No ready documents to download.</p>}
                  <div className="document-archive-parts">
                    {parts.map((files, i) => (
                      <button
                        key={i}
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void download(i)}
                      >
                        {completed.includes(i)
                          ? "Download again"
                          : error && i === partNumber
                            ? "Retry"
                            : "Download"}{" "}
                        {parts.length > 1 ? `part ${i + 1}` : "ZIP"} ·{" "}
                        {formatFileSize(files.reduce((n, f) => n + f.size, 0))}
                        {completed.includes(i) ? " · Completed" : ""}
                      </button>
                    ))}
                  </div>
                  {(busy || phase !== "preparing") && (
                    <TransferProgress
                      direction="download"
                      filename={`Documents part ${partNumber + 1}.zip`}
                      size={
                        parts[partNumber]?.reduce((n, f) => n + f.size, 0) || 0
                      }
                      progress={progress}
                      phase={phase}
                      onCancel={() => abort.current?.abort()}
                      error={phase === "error" ? error : undefined}
                    />
                  )}
                </>
              )
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!loading && !manifest && (
              <button
                className="button secondary"
                onClick={() => void prepare()}
              >
                Retry preparing download
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
