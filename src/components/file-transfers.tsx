"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, X } from "lucide-react";
import { downloadAttachment, type TransferPhase } from "@/lib/file-transfer";
import { formatFileSize } from "@/lib/file-management-model";
import type { AttachmentInfo } from "@/lib/attachment-types";
export function TransferProgress({
  direction,
  filename,
  size,
  progress,
  phase,
  onCancel,
  error,
}: {
  direction: "upload" | "download";
  filename: string;
  size: number;
  progress: number;
  phase: TransferPhase;
  onCancel?: () => void;
  error?: string;
}) {
  const finished = ["complete", "cancelled", "error"].includes(phase);
  const active = phase === "uploading" || phase === "downloading";
  const percentage = Math.max(0, Math.min(100, Math.round(progress)));
  const label =
    phase === "preparing"
      ? direction === "download"
        ? "Preparing download"
        : "Preparing upload"
      : phase === "verifying"
        ? "Checking file"
        : phase === "complete"
          ? direction === "download"
            ? "Download ready"
            : "File ready"
          : phase === "cancelled"
            ? "Transfer cancelled"
            : phase === "error"
              ? "Transfer failed"
              : direction === "download"
                ? "Downloading"
                : "Uploading";
  const Icon =
    phase === "complete"
      ? Check
      : direction === "download"
        ? ArrowDownToLine
        : ArrowUpFromLine;
  return (
    <div
      className="file-transfer"
      data-phase={phase}
      role="group"
      aria-label={`${direction === "upload" ? "Upload" : "Download"}: ${filename}`}
    >
      <span className="file-transfer-icon">
        <Icon size={18} />
      </span>
      <div className="file-transfer-body">
        <div className="file-transfer-heading">
          <strong>{filename}</strong>
          <span aria-live="polite">{label}</span>
        </div>
        <progress
          max={100}
          value={
            active || phase === "complete"
              ? phase === "complete"
                ? 100
                : percentage
              : undefined
          }
          aria-label={`${direction === "upload" ? "Upload" : "Download"} progress for ${filename}`}
        />
        <div className="file-transfer-meta">
          <span>
            {active
              ? `${formatFileSize(Math.round((size * percentage) / 100))} of `
              : ""}
            {formatFileSize(size)}
          </span>
          <span>
            {active
              ? `${percentage}%`
              : phase === "verifying"
                ? "Almost ready…"
                : phase === "complete"
                  ? direction === "download"
                    ? "Sent to your browser"
                    : "Upload complete"
                  : ""}
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {!finished && onCancel && (
        <button
          type="button"
          className="icon-button"
          aria-label={`Cancel ${direction}`}
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function useFileDownload() {
  const controller = useRef<AbortController | null>(null);
  const [transfer, setTransfer] = useState<{
    item: Pick<AttachmentInfo, "id" | "filename" | "size">;
    phase: TransferPhase;
    progress: number;
    error?: string;
  } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const busy = !!transfer && transfer.phase === "downloading";
  async function download(
    item: Pick<AttachmentInfo, "id" | "filename" | "size">,
  ) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setTransfer({ item, phase: "downloading", progress: 0 });
    try {
      await downloadAttachment(
        item,
        (loaded, total) => {
          if (controller.current === abort)
            setTransfer({
              item,
              phase: "downloading",
              progress: total > 0 ? (loaded / total) * 100 : 0,
            });
        },
        abort.signal,
      );
      if (controller.current === abort)
        setTransfer({ item, phase: "complete", progress: 100 });
    } catch (error) {
      if (controller.current === abort)
        setTransfer({
          item,
          phase: abort.signal.aborted ? "cancelled" : "error",
          progress: 0,
          error: abort.signal.aborted
            ? undefined
            : error instanceof Error
              ? error.message
              : "Download failed. Please try again.",
        });
    }
  }
  return {
    download,
    busy,
    view: transfer ? (
      <TransferProgress
        direction="download"
        filename={transfer.item.filename}
        size={transfer.item.size}
        progress={transfer.progress}
        phase={transfer.phase}
        error={transfer.error}
        onCancel={() => controller.current?.abort()}
      />
    ) : null,
  };
}
