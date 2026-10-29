import type { DocumentPurpose } from "./document-model";
import type {
  AttachmentEntity,
  AttachmentInfo,
  UploadReservation,
} from "./attachment-types";
export type TransferPhase =
  | "preparing"
  | "uploading"
  | "verifying"
  | "downloading"
  | "complete"
  | "cancelled"
  | "error";
export class FileTransferError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new FileTransferError(
      body.error || "The file request failed. Please try again.",
      response.status,
    );
  return body;
}
export async function uploadAttachment(
  file: File,
  entityType: AttachmentEntity,
  entityId: string,
  onProgress: (value: number) => void,
  options: {
    signal?: AbortSignal;
    onPhase?: (phase: TransferPhase) => void;
    purpose?: DocumentPurpose;
    documentDate?: string | null;
    replaceDocumentId?: string;
    expectedCurrentId?: string;
    requestId?: string;
  } = {},
) {
  options.onPhase?.("preparing");
  const reservation: UploadReservation = await json(
    await fetch("/api/attachments", {
      method: "POST",
      signal: options.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
        filename: file.name,
        purpose: options.purpose,
        documentDate: options.documentDate,
        replaceDocumentId: options.replaceDocumentId,
        expectedCurrentId: options.expectedCurrentId,
        requestId: options.requestId,
        contentType: file.type,
        size: file.size,
      }),
    }),
  );
  if (!reservation.id)
    throw new Error(
      "Upload permission could not be prepared. Reload and try again.",
    );
  if (reservation.file) {
    onProgress(100);
    options.onPhase?.("complete");
    return reservation.file;
  }
  try {
    if (reservation.provider === "blob") {
      const { upload } = await import("@vercel/blob/client");
      await upload(reservation.storagePath, file, {
        access: "private",
        handleUploadUrl: "/api/attachments/upload",
        clientPayload: JSON.stringify({ id: reservation.id }),
        contentType: reservation.contentType,
        multipart: file.size > 5 * 1024 * 1024,
        abortSignal: options.signal,
        onUploadProgress: (event) => {
          options.onPhase?.("uploading");
          onProgress(event.percentage);
        },
      });
    } else {
      options.onPhase?.("uploading");
      await json(
        await fetch(`/api/attachments/local-upload?id=${reservation.id}`, {
          method: "POST",
          headers: { "Content-Type": reservation.contentType },
          body: file,
          signal: options.signal,
        }),
      );
      onProgress(100);
    }
    options.onPhase?.("verifying");
    for (let attempt = 0; ; attempt++) {
      try {
        const item = await json(
          await fetch(`/api/attachments/${reservation.id}`, {
            method: "POST",
            signal: options.signal,
          }),
        );
        if (options.replaceDocumentId && item.isCurrent === false)
          throw new FileTransferError(
            "Document changed after this upload. Refresh its current version.",
            409,
          );
        options.onPhase?.("complete");
        return item as AttachmentInfo;
      } catch (error) {
        if (
          attempt >= 2 ||
          options.signal?.aborted ||
          (error instanceof FileTransferError &&
            error.status < 500 &&
            error.status !== 409)
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
        options.signal?.throwIfAborted();
      }
    }
  } catch (error) {
    if (options.replaceDocumentId) {
      // A lost upload/finalize response may still have stored verified bytes. Resume
      // the same request; never delete ready evidence as error cleanup.
      if (!options.signal?.aborted) {
        try {
          const item = await json(
            await fetch(`/api/attachments/${reservation.id}`, {
              method: "POST",
              signal: options.signal,
            }),
          );
          if (item.isCurrent !== false) {
            onProgress(100);
            options.onPhase?.("complete");
            return item as AttachmentInfo;
          }
        } catch {}
      }
      throw error;
    }
    const context =
      entityType === "taskDraft"
        ? `?pendingOnly=1&draftId=${encodeURIComponent(entityId)}`
        : "?pendingOnly=1";
    await fetch(`/api/attachments/${reservation.id}${context}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
    throw error;
  }
}
export async function downloadAttachment(
  item: Pick<AttachmentInfo, "id" | "filename" | "size">,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/attachments/${item.id}/content?download=1`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) await json(response);
  if (!response.body) throw new Error("This file could not be downloaded.");
  const total = Number(response.headers.get("Content-Length")) || item.size;
  const reader = response.body.getReader(),
    chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      if (loaded > 25 * 1024 * 1024)
        throw new Error("This download exceeds the document limit.");
      chunks.push(new Uint8Array(value));
      onProgress(loaded, total);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  signal.throwIfAborted();
  if (loaded !== item.size)
    throw new Error("The download was interrupted. Please try again.");
  const url = URL.createObjectURL(
    new Blob(chunks, {
      type: response.headers.get("Content-Type") || "application/octet-stream",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = item.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
