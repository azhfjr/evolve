"use client";
import Link from "next/link";
import { DocumentVersions } from "./connected/document-versions";
import type { AttachmentEntity } from "@/lib/attachment-types";
import { DownloadDocuments, DocumentLabel } from "./document-controls";
import { DOCUMENT_PURPOSES } from "@/lib/document-model";
import { StorageSummary } from "./storage-summary";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LockKeyhole,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppSelect } from "./app-select";
import { Modal, Spinner } from "./ui";
import { useFileDownload } from "./file-transfers";
import {
  formatFileSize,
  WORKSPACE_FILE_LIMIT,
  type FileInventory,
  type ManagedFile,
  type FileRemovalReferences,
  type FileRoom,
} from "@/lib/file-management-model";
import type { WorkspaceData } from "@/lib/types";

export function FileManager({
  data,
  demo,
  onRemoved,
  room: initialRoom = "locker",
  shared = false,
}: {
  room?: FileRoom;
  shared?: boolean;
  data: Pick<WorkspaceData, "actor"> &
    Partial<Pick<WorkspaceData, "revision" | "projects" | "tasks">>;
  demo: boolean;
  onRemoved?: (
    ids: string[],
    references: FileRemovalReferences,
  ) => void | Promise<void>;
}) {
  const [room, setRoom] = useState<FileRoom | "all">(
    shared ? "all" : initialRoom,
  );
  const [history, setHistory] = useState<"current" | "all">("current");
  const [purpose, setPurpose] = useState("all");
  const [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [state, setState] = useState("all"),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [remote, setRemote] = useState<{
    key: string;
    value?: FileInventory;
    error?: string;
  } | null>(null);
  const [selected, setSelected] = useState<Map<string, ManagedFile>>(new Map()),
    [confirm, setConfirm] = useState<ManagedFile[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [demoRemoved, setDemoRemoved] = useState<string[]>([]);
  const download = useFileDownload();
  const key = JSON.stringify([
    room,
    purpose,
    history,
    query,
    type,
    state,
    sort,
    page,
    refresh,
    data.revision,
  ]);
  const examples = useMemo(
    () =>
      [
        {
          id: "example-brief",
          filename: "Engineering brief.pdf",
          contentType: "application/pdf",
          size: 842190,
          entityType: "project",
          entityId: data.projects?.[0]?.id || "",
          context: data.projects?.[0]?.name || "Project",
        },
        {
          id: "example-design",
          filename: "Design review.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 1240120,
          entityType: "task",
          entityId: data.tasks?.[0]?.id || "",
          context: data.tasks?.[0]?.title || "Task",
        },
        {
          id: "example-draft",
          filename: "Planning notes.txt",
          contentType: "text/plain",
          size: 1520,
          entityType: "taskDraft",
          entityId: "",
          context: "Private task draft",
        },
      ].map((item) => ({
        ...item,
        ownerEmail: data.actor.email,
        state: "ready",
        readable: true,
        createdAt: "2026-10-17T03:00:00.000Z",
      })),
    [data.actor.email, data.projects, data.tasks],
  );
  const sample = examples.filter((item) => !demoRemoved.includes(item.id));
  const filtered = sample.filter(
    (item) =>
      (purpose === "all" || purpose === "unlabelled") &&
      (type === "all" || item.entityType === type) &&
      (state === "all" || item.state === state) &&
      `${item.filename} ${item.ownerEmail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const local: FileInventory = {
    items: [...filtered].sort((a, b) =>
      sort === "largest"
        ? b.size - a.size
        : a.filename.localeCompare(b.filename),
    ),
    total: filtered.length,
    page: 1,
    limit: 25,
    usage: {
      breakdown: {
        locker: {
          bytes: sample.reduce((sum, file) => sum + file.size, 0),
          count: sample.length,
        },
        board: { bytes: 0, count: 0 },
        sharedAssets: { bytes: 0, count: 0 },
      },
      bytes: sample.reduce((sum, file) => sum + file.size, 0),
      count: sample.length,
      ready: sample.reduce((sum, file) => sum + file.size, 0),
      pending: 0,
      deleting: 0,
      limit: WORKSPACE_FILE_LIMIT,
    },
  };
  const result = demo ? local : remote?.key === key ? remote.value : undefined;
  const loading = !demo && remote?.key !== key;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        room,
        purpose,
        history,
        q: query,
        type,
        state,
        sort,
        page: String(page),
      });
      fetch(`/api/attachments/manage?${params}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error || "Files could not be loaded.");
          return body as FileInventory;
        })
        .then((value) => {
          if (!controller.signal.aborted) setRemote({ key, value });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setRemote({ key, error: error.message });
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [demo, key, query, type, state, sort, page, room, purpose, history]);
  useEffect(() => {
    if (demo) return;
    const update = () => {
      if (document.visibilityState === "visible") setRefresh((v) => v + 1);
    };
    window.addEventListener("focus", update);
    window.addEventListener("evolve:changed", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("evolve:changed", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [demo]);
  function reset() {
    setPage(1);
    setSelected(new Map());
    setError("");
  }
  function toggle(file: ManagedFile) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(file.id)) next.delete(file.id);
      else if (next.size < 100) next.set(file.id, file);
      return next;
    });
  }
  const selectable =
    result?.items.filter((item) => item.state !== "deleting") || [];
  const allSelected =
    selectable.length > 0 && selectable.every((item) => selected.has(item.id));
  async function remove() {
    if (!confirm || busy) return;
    setBusy(true);
    setError("");
    try {
      let pending = 0;
      if (demo)
        setDemoRemoved((previous) => [
          ...previous,
          ...confirm.map((item) => item.id),
        ]);
      else {
        const scopes = new Set(
          confirm.map((f) =>
            f.entityType === "boardRoomProject" ? "board" : "locker",
          ),
        );
        if (scopes.size !== 1)
          throw new Error(
            "Choose one app before deleting files. Downloads can include both apps.",
          );
        const deleteRoom = [...scopes][0];
        const response = await fetch("/api/attachments/manage", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: deleteRoom,
            ids: confirm.map((item) => item.id),
          }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Files could not be removed.");
        pending = body.pendingCleanup;
        await onRemoved?.(
          confirm.map((item) => item.id),
          body.references,
        );
      }
      setSelected(
        (previous) =>
          new Map(
            [...previous].filter(
              ([id]) => !confirm.some((item) => item.id === id),
            ),
          ),
      );
      toast.success(
        demo
          ? "Demo files removed"
          : pending
            ? "Files removed. Storage cleanup is scheduled."
            : "Files removed",
      );
      setConfirm(null);
      setRefresh((value) => value + 1);
      setPage(1);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Files could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const failure = error || (remote?.key === key ? remote.error : undefined);
  return (
    <div
      className="file-manager"
      aria-label={`${room === "board" ? "Board" : "Locker"} Room file management`}
    >
      <StorageSummary
        usage={result?.usage}
        unavailable={!!(remote?.key === key && remote.error)}
      />
      <h3>
        {room === "all"
          ? "All workspace documents and files"
          : `${room === "board" ? "Board" : "Locker"} Room files`}
      </h3>
      {room === "locker" && (
        <p className="field-help">
          Includes shared profile images and workspace branding.
        </p>
      )}
      {demo && (
        <p className="file-demo-note">
          Sample files · changes affect this demo only. Sign in to download real
          files.
        </p>
      )}
      {!demo && (
        <div className="file-export-actions">
          <DownloadDocuments
            request={{
              kind: "workspace",
              ...(history === "all" ? { includeHistory: true } : {}),
              ...(shared || room === "all" ? {} : { room }),
            }}
          />
          <DownloadDocuments
            label="Download selected"
            disabled={!selected.size}
            request={{
              kind: "selection",
              ...(history === "all" ? { includeHistory: true } : {}),
              ...(room === "all" ? {} : { room }),
              ids: [...selected.keys()],
            }}
          />
        </div>
      )}
      {!demo && (
        <p className="field-help">
          Download all documents includes ready project and task documents{" "}
          {shared || room === "all"
            ? "across both apps"
            : `in ${room === "board" ? "Board" : "Locker"} Room`}
          , regardless of table filters or pages. Download selected uses the
          checked documents.
        </p>
      )}
      <div className="file-manager-toolbar">
        {shared && (
          <AppSelect
            aria-label="Filter file app"
            value={room}
            onValueChange={(v) => {
              setRoom(v as FileRoom | "all");
              setType("all");
              reset();
            }}
          >
            <option value="all">Both apps</option>
            <option value="locker">Locker Room</option>
            <option value="board">Board Room</option>
          </AppSelect>
        )}
        <AppSelect
          aria-label="File versions"
          value={history}
          onValueChange={(v) => {
            setHistory(v as "current" | "all");
            setPage(1);
          }}
        >
          <option value="current">Current versions</option>
          <option value="all">Include version history</option>
        </AppSelect>
        <AppSelect
          aria-label="Filter document purpose"
          value={purpose}
          onValueChange={(v) => {
            setPurpose(v);
            reset();
          }}
        >
          <option value="all">All purposes</option>
          <option value="unlabelled">Unlabelled</option>
          {DOCUMENT_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </AppSelect>
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search workspace files"
            placeholder="Search file or uploader…"
            maxLength={160}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
          />
        </label>
        <AppSelect
          aria-label="File type"
          value={type}
          onValueChange={(value) => {
            setType(value);
            reset();
          }}
        >
          {[
            ["all", "All locations"],
            ...(room === "all"
              ? [["boardRoomProject", "Board Room projects"]]
              : []),
            ...(room === "board"
              ? [["boardRoomProject", "Board Room projects"]]
              : [
                  ["task", "Tasks"],
                  ["project", "Locker Room projects"],
                  ["taskDraft", "Task drafts"],
                  ["avatar", "Profile photos"],
                  ["workspace", "Workspace logo"],
                ]),
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AppSelect>
        <AppSelect
          aria-label="File status"
          value={state}
          onValueChange={(value) => {
            setState(value);
            reset();
          }}
        >
          <option value="all">All statuses</option>
          <option value="ready">Ready</option>
          <option value="pending">Uploading</option>
          <option value="deleting">Removing</option>
        </AppSelect>
        <AppSelect
          aria-label="Sort files"
          value={sort}
          onValueChange={(value) => {
            setSort(value);
            reset();
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="largest">Largest first</option>
        </AppSelect>
        <button
          className="icon-button"
          aria-label="Refresh files"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="file-selection-bar">
        <span>
          {selected.size
            ? `${selected.size} selected${selected.size > (result?.items.filter((item) => selected.has(item.id)).length || 0) ? " across pages" : ""}`
            : "Select files to manage them together"}
        </span>
        {selected.size > 0 && (
          <button className="text-link" onClick={() => setSelected(new Map())}>
            Clear selection
          </button>
        )}
        <button
          className="button secondary small-button danger-text"
          disabled={!selected.size || busy || download.busy}
          onClick={() => {
            setError("");
            setConfirm([...selected.values()]);
          }}
        >
          <Trash2 size={15} />
          Delete selected
        </button>
      </div>
      {download.view}
      {failure && !confirm && (
        <p role="alert" className="form-error">
          {failure}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setRefresh((value) => value + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}
      {loading ? (
        <p className="file-loading" role="status">
          <Spinner />
          Loading workspace files…
        </p>
      ) : (
        result && (
          <>
            <div
              className="file-table-scroll"
              role="region"
              aria-label="Workspace files"
              tabIndex={0}
            >
              <table className="file-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all files on this page"
                        checked={allSelected}
                        disabled={!selectable.length}
                        onChange={() => {
                          if (allSelected)
                            setSelected(
                              (previous) =>
                                new Map(
                                  [...previous].filter(
                                    ([id]) =>
                                      !selectable.some(
                                        (item) => item.id === id,
                                      ),
                                  ),
                                ),
                            );
                          else if (
                            selected.size +
                              selectable.filter(
                                (item) => !selected.has(item.id),
                              ).length <=
                            100
                          )
                            setSelected(
                              (previous) =>
                                new Map([
                                  ...previous,
                                  ...selectable.map(
                                    (item) => [item.id, item] as const,
                                  ),
                                ]),
                            );
                          else setError("Select up to 100 files at a time.");
                        }}
                      />
                    </th>
                    <th>File</th>
                    <th>Purpose</th>
                    <th>Project / task</th>
                    <th>App</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Uploader</th>
                    <th>Uploaded</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.id} data-selected={selected.has(item.id)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.filename}`}
                          checked={selected.has(item.id)}
                          disabled={
                            item.state === "deleting" ||
                            (!selected.has(item.id) && selected.size >= 100)
                          }
                          onChange={() => toggle(item)}
                        />
                      </td>
                      <td>
                        <div className="managed-file-name">
                          <FileText size={19} />
                          <div>
                            <strong>{item.filename}</strong>
                            {item.archived && (
                              <small>Legacy archive · read-only</small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {["avatar", "workspace"].includes(item.entityType) ? (
                          <span>—</span>
                        ) : (
                          <>
                            {item.state === "ready" &&
                              ["task", "project", "boardRoomProject"].includes(
                                item.entityType,
                              ) && (
                                <DocumentVersions
                                  file={item}
                                  entityType={
                                    item.entityType as AttachmentEntity
                                  }
                                  entityId={item.entityId}
                                  editable={
                                    !item.archived && item.isCurrent !== false
                                  }
                                  admin={!item.archived}
                                  onChanged={() => setRefresh((v) => v + 1)}
                                />
                              )}
                            <DocumentLabel
                              file={item}
                              editable={
                                !item.archived &&
                                item.state === "ready" &&
                                (item.entityType !== "taskDraft" ||
                                  item.ownerEmail === data.actor.email)
                              }
                              onChanged={() => setRefresh((v) => v + 1)}
                            />
                          </>
                        )}
                      </td>
                      <td>
                        <span className="managed-file-context">
                          {item.entityType === "taskDraft" && (
                            <LockKeyhole size={12} />
                          )}{" "}
                          {item.projectId ? (
                            <Link
                              href={
                                item.entityType === "boardRoomProject"
                                  ? `/board-room/projects/${item.projectId}`
                                  : `/app?section=project&project=${item.projectId}`
                              }
                            >
                              {item.projectName || item.context}
                            </Link>
                          ) : (
                            item.context
                          )}
                        </span>
                        {item.taskName && <small>{item.taskName}</small>}
                      </td>
                      <td>
                        {["avatar", "workspace"].includes(item.entityType)
                          ? "Shared assets"
                          : item.entityType === "boardRoomProject"
                            ? "Board Room"
                            : "Locker Room"}
                      </td>
                      <td>{formatFileSize(item.size)}</td>
                      <td>
                        <span className="file-state" data-state={item.state}>
                          {item.state === "ready"
                            ? "Ready"
                            : item.state === "pending"
                              ? "Uploading"
                              : "Removing"}
                        </span>
                        {item.entityType === "taskDraft" && !item.readable && (
                          <small>Private content</small>
                        )}
                      </td>
                      <td className="file-uploader">{item.ownerEmail}</td>
                      <td>
                        <time dateTime={item.createdAt}>
                          {new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                          }).format(new Date(item.createdAt))}
                        </time>
                      </td>
                      <td>
                        <div className="file-row-actions">
                          <button
                            className="icon-button"
                            aria-label={`Download ${item.filename}`}
                            disabled={demo || !item.readable || download.busy}
                            onClick={() => void download.download(item)}
                          >
                            <Download size={16} />
                          </button>
                          <button
                            className="icon-button danger-text"
                            aria-label={`Delete ${item.filename}`}
                            disabled={
                              busy ||
                              download.busy ||
                              (item.state === "deleting" &&
                                !item.canRetryCleanup)
                            }
                            onClick={() => {
                              setError("");
                              setConfirm([item]);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!result.items.length && (
                <p className="file-empty">No files match these filters.</p>
              )}
            </div>
            <div className="file-pagination">
              <span>
                {result.total} matching files · Page {page}
              </span>
              <button
                className="button secondary small-button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <button
                className="button secondary small-button"
                disabled={page * result.limit >= result.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </>
        )
      )}
      {confirm && (
        <Modal
          open
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
          title={`Delete ${confirm.length === 1 ? "this file" : `${confirm.length} files`}?`}
          description={
            room === "board"
              ? "Files will be removed from Board Room projects. Their document reviews will need to be renewed. This cannot be undone."
              : "Files will be removed from Locker Room. Linked profile photos or logos will also be cleared. This cannot be undone."
          }
        >
          <ul
            className="file-delete-preview"
            tabIndex={0}
            aria-label="Files to delete"
          >
            {confirm.slice(0, 4).map((item) => (
              <li key={item.id}>
                <FileText size={16} />
                <span>{item.filename}</span>
                <small>{formatFileSize(item.size)}</small>
              </li>
            ))}
            {confirm.length > 4 && <li>And {confirm.length - 4} more files</li>}
          </ul>
          <p className="muted small">
            {formatFileSize(confirm.reduce((sum, item) => sum + item.size, 0))}{" "}
            selected{demo ? " · Demo only" : ""}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? <Spinner /> : <Trash2 size={16} />}Delete{" "}
              {confirm.length === 1 ? "file" : `${confirm.length} files`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
