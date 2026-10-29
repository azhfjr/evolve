"use client";
import { DocumentDateInput, DocumentDateControl } from "./document-date";
import { changed } from "./connected/data";
import { DocumentVersions } from "./connected/document-versions";
import {
  PurposeSelect,
  DocumentLabel,
  DownloadDocuments,
} from "./document-controls";
import type { DocumentPurpose } from "@/lib/document-model";
import { useI18n, currentTranslator } from "./i18n-provider";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Download,
  FileText,
  Paperclip,
  Trash2,
  Upload,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "./ui";
import { uploadAttachment, type TransferPhase } from "@/lib/file-transfer";
import { TransferProgress, useFileDownload } from "./file-transfers";
export { uploadAttachment } from "@/lib/file-transfer";
import type { AttachmentInfo } from "@/lib/attachment-types";

async function jsonResponse(response: Response) {
  const t = currentTranslator();
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || t("Permintaan gagal. Coba lagi."));
  return body;
}
export function ImageUpload({
  entityType,
  entityId,
  demo,
  value,
  onChange,
}: {
  entityType: "avatar" | "workspace";
  entityId: string;
  demo: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<TransferPhase>("preparing");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbort.current?.abort(), []);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="image-upload-row">
      {value ? (
        <Image
          src={`/api/attachments/${value}/content`}
          className="profile-photo"
          alt={entityType === "avatar" ? t("Foto profil") : t("Logo workspace")}
          width={72}
          height={72}
          unoptimized
        />
      ) : (
        <span className="profile-photo placeholder">
          <Upload size={22} />
        </span>
      )}
      <div>
        <button
          type="button"
          className="button secondary"
          disabled={busy || demo}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <>
              <Spinner />
              {Math.round(progress)}%
            </>
          ) : (
            t("Unggah gambar")
          )}
        </button>
        {value && (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => onChange(null)}
          >
            {t("Hapus dari profil")}
          </button>
        )}
        <p className="muted small">
          {demo
            ? t("Unggah gambar tersedia setelah masuk ke workspace.")
            : t("PNG, JPEG, atau WebP · maksimal 2 MB")}
        </p>
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
      </div>
      {busy && uploadFile && (
        <TransferProgress
          direction="upload"
          filename={uploadFile.name}
          size={uploadFile.size}
          progress={progress}
          phase={phase}
          onCancel={() => uploadAbort.current?.abort()}
        />
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setUploadFile(file);
          uploadAbort.current = new AbortController();
          setProgress(0);
          setError("");
          try {
            const item = await uploadAttachment(
              file,
              entityType,
              entityId,
              setProgress,
              { signal: uploadAbort.current?.signal, onPhase: setPhase },
            );
            onChange(item.id);
          } catch (e) {
            setError(
              uploadAbort.current?.signal.aborted
                ? "Upload cancelled. Choose the file to try again."
                : (e as Error).message,
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
export function Attachments({
  entityType,
  entityId,
  actorEmail,
  isAdmin,
  demo = false,
  revision = 0,
  archiveRoom,
}: {
  entityType: "task" | "project" | "boardRoomProject";
  entityId: string;
  actorEmail: string;
  isAdmin: boolean;
  demo?: boolean;
  revision?: number;
  archiveRoom?: "locker" | "board";
}) {
  const { t } = useI18n();
  const [documentDate, setDocumentDate] = useState("");
  const [purpose, setPurpose] = useState<DocumentPurpose | "">("");
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [items, setItems] = useState<AttachmentInfo[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<TransferPhase>("preparing");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbort.current?.abort(), []);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const download = useFileDownload();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    fetch(
      `/api/attachments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
      { signal: abort.signal },
    )
      .then(jsonResponse)
      .then((data) => setItems(data.attachments))
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [entityType, entityId, demo, revision, versionRefresh]);
  async function add(file: File) {
    if (busy || demo) return;
    if (!purpose) {
      setError("Choose a document purpose before uploading.");
      return;
    }
    setBusy(true);
    setUploadFile(file);
    uploadAbort.current = new AbortController();
    setProgress(0);
    setError("");
    try {
      const item = await uploadAttachment(
        file,
        entityType,
        entityId,
        setProgress,
        {
          signal: uploadAbort.current.signal,
          onPhase: setPhase,
          purpose: purpose || undefined,
          ...(entityType === "boardRoomProject"
            ? { documentDate: documentDate || null }
            : {}),
        },
      );
      setItems((current) => [
        ...current.filter((old) => old.id !== item.id),
        item,
      ]);
      changed();
      toast.success(t("Dokumen terlampir"));
    } catch (e) {
      setError(
        uploadAbort.current?.signal.aborted
          ? "Upload cancelled. Choose the file to try again."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="attachment-section" aria-label={t("Lampiran dokumen")}>
      <div className="section-heading">
        <h3>
          <Paperclip size={17} />
          {entityType !== "task" ? "Documents" : t("Lampiran")}{" "}
          <span className="count-badge">{items.length}</span>
        </h3>
        <button
          type="button"
          className="button secondary"
          disabled={
            busy || demo || (entityType === "boardRoomProject" && !isAdmin)
          }
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          {t("Unggah dokumen")}
        </button>
      </div>
      {entityType !== "task" && !demo && (
        <DownloadDocuments
          request={{
            kind: "project",
            room:
              archiveRoom ??
              (entityType === "boardRoomProject" ? "board" : "locker"),
            id: entityId,
          }}
        />
      )}
      <div className="document-upload-purpose">
        <PurposeSelect
          value={purpose}
          onChange={setPurpose}
          disabled={
            busy || demo || (entityType === "boardRoomProject" && !isAdmin)
          }
          label="Upload purpose"
        />
      </div>
      {entityType === "boardRoomProject" && isAdmin && (
        <DocumentDateInput
          value={documentDate}
          onChange={setDocumentDate}
          disabled={busy || demo}
          label="Upload document date"
        />
      )}
      <input
        hidden
        ref={input}
        aria-label={
          entityType !== "task"
            ? "Upload project document"
            : "Upload task attachment"
        }
        type="file"
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void add(file);
        }}
      />
      {loading ? (
        <p>
          <Spinner />
          {t("Memuat lampiran…")}
        </p>
      ) : (
        !items.length && (
          <div
            className="upload-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void add(file);
            }}
          >
            <Paperclip size={24} />
            <p>
              {demo
                ? t("Lampiran dokumen tersedia di workspace setelah masuk.")
                : t("Tarik dokumen ke sini atau pilih Unggah dokumen.")}
            </p>
            <small>
              {t("PDF, Office, teks, dan gambar · maksimal 25 MB per dokumen")}
            </small>
          </div>
        )
      )}
      {busy && uploadFile && (
        <TransferProgress
          direction="upload"
          filename={uploadFile.name}
          size={uploadFile.size}
          progress={progress}
          phase={phase}
          onCancel={() => uploadAbort.current?.abort()}
        />
      )}
      {download.view}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <ul className="attachment-list">
        {items.map((item) => (
          <li key={item.id}>
            <FileText size={22} />
            <div>
              <strong>{item.filename}</strong>
              <small>
                {(item.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                {new Intl.DateTimeFormat("id", { dateStyle: "medium" }).format(
                  new Date(item.createdAt),
                )}
              </small>
            </div>
            {entityType === "boardRoomProject" && (
              <DocumentDateControl
                file={item}
                editable={!demo && isAdmin}
                onChanged={(updated) =>
                  setItems((current) =>
                    current.map((f) => (f.id === updated.id ? updated : f)),
                  )
                }
              />
            )}
            <DocumentVersions
              file={item}
              entityType={entityType}
              entityId={entityId}
              editable={
                !demo &&
                (isAdmin ||
                  (entityType !== "boardRoomProject" &&
                    item.ownerEmail === actorEmail))
              }
              admin={isAdmin}
              onChanged={(updated) => {
                if (updated)
                  setItems((current) => [
                    updated,
                    ...current.filter(
                      (f) =>
                        f.id !== item.id && f.documentId !== updated.documentId,
                    ),
                  ]);
                setVersionRefresh((v) => v + 1);
              }}
            />
            <DocumentLabel
              file={item}
              editable={
                !demo &&
                (isAdmin ||
                  (entityType !== "boardRoomProject" &&
                    item.ownerEmail === actorEmail))
              }
              onChanged={(updated) =>
                setItems((current) =>
                  current.map((f) => (f.id === updated.id ? updated : f)),
                )
              }
            />
            {(item.contentType === "application/pdf" ||
              item.contentType.startsWith("image/")) && (
              <a
                className="icon-button"
                href={`/api/attachments/${item.id}/content`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Preview {filename}", {
                  filename: item.filename,
                })}
              >
                <ExternalLink size={16} />
              </a>
            )}
            <button
              type="button"
              className="icon-button"
              disabled={download.busy}
              onClick={() => void download.download(item)}
              aria-label={t("Download {filename}", { filename: item.filename })}
            >
              <Download size={16} />
            </button>
            {(isAdmin ||
              (entityType !== "boardRoomProject" &&
                item.ownerEmail === actorEmail)) && (
              <button
                type="button"
                className="icon-button"
                aria-label={t("Delete {filename}", { filename: item.filename })}
                onClick={() => setRemove(item.id)}
              >
                <Trash2 size={16} />
              </button>
            )}
            {remove === item.id && (
              <div
                className="attachment-confirm"
                role="group"
                aria-label={t("Konfirmasi hapus lampiran")}
              >
                <span>{t("Hapus dokumen ini?")}</span>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setRemove(null)}
                >
                  {t("Batal")}
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    setUploadFile(null);
                    setBusy(true);
                    try {
                      await jsonResponse(
                        await fetch(`/api/attachments/${item.id}`, {
                          method: "DELETE",
                        }),
                      );
                      setItems((current) =>
                        current.filter((f) => f.id !== item.id),
                      );
                      setRemove(null);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("Hapus")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
