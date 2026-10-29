"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui";
import { uploadAttachment, type TransferPhase } from "@/lib/file-transfer";
import { TransferProgress } from "../file-transfers";
import { formatFileSize } from "@/lib/file-management-model";
import type { AttachmentInfo, AttachmentEntity } from "@/lib/attachment-types";
import { connectedRequest, changed } from "./data";
type History = {
  documentId: string | null;
  currentId: string | null;
  versions: {
    id: string;
    filename: string;
    size: number;
    versionNumber: number;
    ownerEmail: string;
    createdAt: string;
    isCurrent: boolean;
  }[];
};
export function DocumentVersions({
  file,
  entityType,
  entityId,
  editable,
  admin,
  onChanged,
}: {
  file: AttachmentInfo;
  entityType: AttachmentEntity;
  entityId: string;
  editable: boolean;
  admin: boolean;
  onChanged: (updated?: AttachmentInfo) => void | Promise<void>;
}) {
  const [history, setHistory] = useState<History | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<File | null>(null),
    [progress, setProgress] = useState(0),
    [phase, setPhase] = useState<TransferPhase>("preparing");
  const requestId = useRef(crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function load() {
    setOpen(true);
    setError("");
    try {
      setHistory(
        await connectedRequest<History>(`/api/attachments/${file.id}/versions`),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function replace(next: File) {
    setSelected(next);
    setProgress(0);
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      const updated = await uploadAttachment(
        next,
        entityType,
        entityId,
        setProgress,
        {
          signal: abort.current.signal,
          onPhase: setPhase,
          purpose: file.purpose ?? undefined,
          replaceDocumentId: file.documentId ?? file.id,
          expectedCurrentId: file.id,
          requestId: requestId.current,
        },
      );
      changed();
      await onChanged(updated);
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connected-document-versions">
      <button type="button" onClick={() => void load()}>
        Version history{file.versionNumber ? " · v" + file.versionNumber : ""}
      </button>
      {editable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Replace document
        </button>
      )}
      <input
        hidden
        ref={input}
        type="file"
        aria-label={`Replace ${file.filename}`}
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            requestId.current = crypto.randomUUID();
            void replace(f);
          }
        }}
      />
      {selected && (
        <TransferProgress
          direction="upload"
          filename={selected.name}
          size={selected.size}
          progress={progress}
          phase={phase}
          onCancel={() => abort.current?.abort()}
          error={error}
        />
      )}
      {selected && !busy && error && (
        <button type="button" onClick={() => void replace(selected)}>
          Retry replacement
        </button>
      )}
      {error && !open && <p role="alert">{error}</p>}
      {open && (
        <Modal
          open
          title={"Versions — " + file.filename}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="connected-form">
            <p>
              Previous versions remain private and count toward the shared 1 GB
              allowance. Only an administrator can restore or remove history.
            </p>
            {error && (
              <p role="alert">
                {error}
                <button onClick={() => void load()}>Retry</button>
              </p>
            )}
            {!history && !error && <p role="status">Loading versions…</p>}
            <ul className="connected-issues">
              {history?.versions.map((v) => (
                <li key={v.id}>
                  <strong>
                    Version {v.versionNumber}
                    {v.isCurrent ? " · Current" : ""}
                  </strong>
                  <p>
                    {v.filename} · {formatFileSize(v.size)} · {v.ownerEmail} ·{" "}
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                  <div className="connected-actions">
                    <a href={`/api/attachments/${v.id}/content?download=1`}>
                      Download version {v.versionNumber}
                    </a>
                    {admin && !v.isCurrent && (
                      <>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const result = await connectedRequest<{
                                file: AttachmentInfo;
                              }>(`/api/attachments/${v.id}/versions`, {
                                expectedCurrentId: history.currentId,
                              });
                              changed();
                              await onChanged(result.file);
                              setOpen(false);
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Restore as current
                        </button>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            if (
                              !confirm(
                                `Permanently delete version ${v.versionNumber}? Capacity is released after storage cleanup.`,
                              )
                            )
                              return;
                            setBusy(true);
                            try {
                              const r = await fetch(
                                `/api/attachments/${v.id}`,
                                { method: "DELETE" },
                              );
                              if (!r.ok) throw Error((await r.json()).error);
                              changed();
                              onChanged();
                              await load();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Delete version
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}
