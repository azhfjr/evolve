"use client";
import { useEffect, useRef, useState } from "react";
import { AppSelect } from "../app-select";
import { DocumentDateControl, formatDocumentDate } from "../document-date";
import { DocumentVersions } from "./document-versions";
import { DocumentLabel } from "../document-controls";
import { formatFileSize } from "@/lib/file-management-model";
import { useFileDownload } from "../file-transfers";
import type { StorylinePage } from "@/lib/project-storyline";
import type { AttachmentInfo } from "@/lib/attachment-types";
import { refreshStorylinePages } from "@/lib/storyline-refresh";
import { changed } from "./data";
export function ProjectStoryline({
  projectId,
  admin,
}: {
  projectId: string;
  admin: boolean;
}) {
  const [order, setOrder] = useState("oldest"),
    [group, setGroup] = useState("dated"),
    [data, setData] = useState<StorylinePage | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0),
    [more, setMore] = useState(false);
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    download = useFileDownload();
  const loadedCount = useRef(50),
    scope = useRef("");
  useEffect(() => {
    loadedCount.current = Math.max(50, data?.items.length ?? 50);
  }, [data]);
  useEffect(() => {
    const key = `${projectId}:${order}:${group}`;
    const retain = scope.current === key ? loadedCount.current : 50;
    scope.current = key;
    const version = ++generation.current;
    const abort = new AbortController();
    request.current?.abort();
    request.current = abort;
    let ignore = false;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      refreshStorylinePages(async (cursor) => {
        const response = await fetch(
          `/api/board-room/storyline?id=${projectId}&order=${order}&group=${group}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
          { signal: abort.signal, cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || "Unable to load Storyline.");
        return body as StorylinePage;
      }, retain)
        .then((body) => {
          if (ignore || version !== generation.current) return;
          setData(body);
          if (group === "dated" && !body.datedCount && body.undatedCount)
            setGroup("undated");
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false);
        });
    }, 0);
    return () => {
      ignore = true;
      clearTimeout(timer);
      abort.abort();
    };
  }, [projectId, order, group, refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setMore(false);
        setRefresh((v) => v + 1);
      }, 200);
    };
    const visible = () => {
      if (document.visibilityState === "visible") update();
    };
    const interval = setInterval(visible, 45000);
    window.addEventListener("evolve:changed", update);
    window.addEventListener("online", update);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("evolve:changed", update);
      window.removeEventListener("online", update);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const items = data?.items ?? [];
  return (
    <section
      className="project-storyline"
      aria-label="Project Storyline"
      aria-busy={busy || more}
    >
      <header className="section-heading">
        <div>
          <h3>Project Storyline</h3>
          <p className="field-hint">
            Current project documents, arranged by their document date. Upload
            time is shown separately.
          </p>
        </div>
      </header>
      <div className="connected-actions">
        <AppSelect
          aria-label="Storyline order"
          value={order}
          onValueChange={setOrder}
        >
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </AppSelect>
        <button
          type="button"
          aria-pressed={group === "dated"}
          onClick={() => setGroup("dated")}
        >
          Dated documents{data ? ` (${data.datedCount})` : ""}
        </button>
        <button
          type="button"
          aria-pressed={group === "undated"}
          onClick={() => setGroup("undated")}
        >
          Undated documents{data ? ` (${data.undatedCount})` : ""}
        </button>
      </div>
      {busy && <p role="status">Refreshing document chronology…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            Retry
          </button>
        </p>
      )}
      {data && !busy && !error && !items.length && (
        <div className="storyline-empty">
          <h4>
            {group === "undated"
              ? "No undated documents"
              : "No dated documents"}
          </h4>
          <p>
            {group === "undated"
              ? "All current project documents have a date, or no documents have been uploaded."
              : "Documents appear here after upload and date assignment. Use Documents to upload evidence, or explore Undated documents."}
          </p>
        </div>
      )}
      {group === "undated" && data && data.undatedCount > 0 && (
        <p className="field-hint">
          These documents have no assigned document date. Upload times do not
          determine their position.
        </p>
      )}
      <ol className="storyline-list">
        {items.map((file, index) => {
          const heading =
            index === 0 || file.documentDate !== items[index - 1].documentDate;
          return (
            <li key={file.documentId ?? file.id}>
              {heading && (
                <h4 className="storyline-date">
                  {file.documentDate ? (
                    <time dateTime={file.documentDate}>
                      {formatDocumentDate(file.documentDate)}
                    </time>
                  ) : (
                    "Undated documents"
                  )}
                </h4>
              )}
              <article className="storyline-document">
                <h4>
                  <a
                    href={`/api/attachments/${file.id}/content`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file.filename}
                  </a>
                </h4>
                <p className="field-hint">
                  Version {file.versionNumber ?? 1} ·{" "}
                  {formatFileSize(file.size)} · {file.contentType}
                </p>
                <p className="field-hint">
                  Uploaded by {file.ownerEmail} ·{" "}
                  <time dateTime={file.createdAt}>
                    {new Date(file.createdAt).toLocaleString()}
                  </time>
                </p>
                <div className="storyline-document-controls">
                  <DocumentLabel
                    file={file}
                    editable={admin}
                    onChanged={() => changed()}
                  />
                  <DocumentDateControl
                    file={file}
                    editable={admin}
                    onChanged={(updated) => {
                      setGroup(updated.documentDate ? "dated" : "undated");
                      changed();
                    }}
                  />
                </div>
                <div className="connected-actions">
                  <button
                    type="button"
                    disabled={download.busy}
                    onClick={() => void download.download(file)}
                  >
                    Download {file.filename}
                  </button>
                  <DocumentVersions
                    file={file}
                    entityType="boardRoomProject"
                    entityId={projectId}
                    editable={admin}
                    admin={admin}
                    onChanged={() => changed()}
                  />
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      {data?.nextCursor && (
        <button
          type="button"
          disabled={busy || more}
          onClick={async () => {
            const version = generation.current;
            setMore(true);
            setError("");
            try {
              const response = await fetch(
                `/api/board-room/storyline?id=${projectId}&order=${order}&group=${group}&cursor=${encodeURIComponent(data.nextCursor!)}`,
                { cache: "no-store" },
              );
              const body = await response.json();
              if (version !== generation.current) return;
              if (response.status === 409) {
                setNotice(
                  "Documents changed. The chronology has been refreshed.",
                );
                setRefresh((v) => v + 1);
                return;
              }
              if (!response.ok)
                throw Error(body.error || "Unable to load more documents.");
              setData((current) =>
                current
                  ? {
                      ...body,
                      items: [...current.items, ...body.items].filter(
                        (
                          file: AttachmentInfo,
                          index: number,
                          all: AttachmentInfo[],
                        ) =>
                          all.findIndex(
                            (f) => f.documentId === file.documentId,
                          ) === index,
                      ),
                    }
                  : body,
              );
            } catch (e) {
              if (version === generation.current)
                setError((e as Error).message);
            } finally {
              setMore(false);
            }
          }}
        >
          {more ? "Loading…" : "Load more documents"}
        </button>
      )}
      {download.view}
    </section>
  );
}
