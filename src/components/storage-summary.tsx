"use client";
import Link from "next/link";
import { HardDrive } from "lucide-react";
import {
  formatFileSize,
  type FileInventory,
} from "@/lib/file-management-model";
import { storageGuidance } from "@/lib/storage-guidance";
export function StorageSummary({
  usage,
  unavailable = false,
}: {
  usage?: FileInventory["usage"];
  unavailable?: boolean;
}) {
  const guidance = usage ? storageGuidance(usage.bytes, usage.limit) : null;
  return (
    <section
      className="file-storage-overview"
      aria-label="Shared workspace storage"
      aria-busy={!usage && !unavailable}
    >
      <div className="file-storage-summary">
        <span className="file-storage-icon">
          <HardDrive size={21} />
        </span>
        <div>
          <h3>Workspace storage</h3>
          <p>One allowance shared by Locker Room and Board Room</p>
        </div>
        <div className="storage-amount">
          <strong>
            {usage ? formatFileSize(usage.bytes) : "…"}{" "}
            <small>
              of {usage ? formatFileSize(usage.limit) : "1 GB"} allocated
            </small>
          </strong>
          <span>
            {usage
              ? `${formatFileSize(Math.max(0, usage.limit - usage.bytes))} remaining for both apps · ${usage.count} files`
              : unavailable
                ? "Storage usage unavailable."
                : "Loading storage usage…"}
          </span>
        </div>
      </div>
      {usage && (
        <progress
          className="file-capacity"
          max={usage.limit}
          value={usage.bytes}
          aria-label="Workspace storage allocation"
        />
      )}
      <div className="storage-usage-grid">
        {(
          [
            [
              "locker",
              "Locker Room",
              "Project documents, task attachments and task drafts",
              "/app?section=files",
            ],
            [
              "board",
              "Board Room",
              "Project documents",
              "/board-room?section=files",
            ],
            [
              "sharedAssets",
              "Shared assets",
              "Profile images and workspace branding",
              null,
            ],
          ] as const
        ).map(([key, name, description, href]) => {
          const bucket = usage?.breakdown[key];
          return (
            <article className="storage-usage-card" key={key}>
              <h4>{name}</h4>
              <p>{description}</p>
              <strong>{bucket ? formatFileSize(bucket.bytes) : "…"}</strong>
              <span>
                {bucket && usage
                  ? `${bucket.count} files · ${((bucket.bytes / usage.limit) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% of shared allowance`
                  : unavailable
                    ? "Unavailable"
                    : "Loading…"}
              </span>
              {href ? (
                <Link href={href}>Manage {name} files</Link>
              ) : (
                <span>Managed in Locker Room files</span>
              )}
            </article>
          );
        })}
      </div>
      {guidance && ["warning", "critical", "full"].includes(guidance.level) && (
        <p
          className="file-quota-warning"
          role="status"
          data-level={guidance.level}
        >
          <strong>
            {guidance.level === "full"
              ? "Shared storage is full."
              : `${guidance.percent}% of shared storage is allocated.`}
          </strong>{" "}
          Review large or unused files before uploading more.
        </p>
      )}
      <p className="field-help">
        Usage includes pending uploads and files awaiting cleanup. Deleting
        removes access immediately; capacity becomes available after storage
        cleanup succeeds. Recent uploads may remain reserved for 70 minutes.
        Documents: up to 25 MB each; profile images: up to 2 MB.
      </p>
    </section>
  );
}
