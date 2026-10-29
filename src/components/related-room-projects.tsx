"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Link2 } from "lucide-react";
import type { RelatedProjects } from "@/lib/project-room-links";
import "./related-room-projects.css";
export function RelatedRoomProjects({
  room,
  id,
  revision = 0,
  onNavigate,
}: {
  room: "locker" | "board";
  id: string;
  revision?: number;
  onNavigate?: (href: string) => void;
}) {
  const [data, setData] = useState<RelatedProjects | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/related?${new URLSearchParams({ room, id })}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "Linked projects could not be loaded.");
        return result as RelatedProjects;
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Linked projects could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [room, id, revision, retry]);
  const target = room === "board" ? "Locker Room" : "Board Room";
  return (
    <section
      className="related-room-projects"
      aria-label="Connected room projects"
    >
      <div className="related-room-heading">
        <Link2 size={17} />
        <h3>Connected projects</h3>
        <span>{target}</span>
      </div>
      <p>Matched by RUPTL Code. Each room keeps its own records and updates.</p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status">Finding connected projects…</p>
      ) : (
        <>
          {!data.code ? (
            <p>
              Add a RUPTL Code in the project reference to find matching
              projects.
            </p>
          ) : (
            <>
              <small>RUPTL Code · {data.code}</small>
              {data.projects.length ? (
                <ul>
                  {data.projects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={project.href}
                        onNavigate={(event) => {
                          if (onNavigate) {
                            event.preventDefault();
                            onNavigate(project.href);
                          }
                        }}
                      >
                        {project.name}
                        <ArrowUpRight size={15} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No matching project in {target} yet.</p>
              )}
              {data.projects.length > 1 && (
                <p>
                  Multiple records share this code. Choose the project to open;
                  no records have been merged.
                </p>
              )}
              {data.hasMore && (
                <p>
                  Showing the first 20 matches. Refine duplicate project
                  references in {target}.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
