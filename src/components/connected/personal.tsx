"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { connectedRequest, useConnectedData } from "./data";
type Personal = {
  items: { id: string; name: string; pinned: boolean; version: number }[];
};
export function ProjectPin({ id }: { id: string }) {
  const r = useConnectedData<Personal>("/api/workspace/personal-projects"),
    [error, setError] = useState("");
  useEffect(() => {
    void connectedRequest("/api/workspace/personal-projects", {
      action: "visit",
      id,
    })
      .then(r.retry)
      .catch(() => {});
  }, [id, r.retry]);
  const current = r.data?.items.find((p) => p.id === id);
  return (
    <>
      <button
        disabled={r.busy}
        onClick={async () => {
          try {
            await connectedRequest("/api/workspace/personal-projects", {
              action: "pin",
              id,
              pinned: !current?.pinned,
              version: current?.version ?? 0,
            });
            r.retry();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {current?.pinned ? "Unpin project" : "Pin project"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function ProjectShortcuts() {
  const r = useConnectedData<Personal>("/api/workspace/personal-projects");
  return (
    <section className="connected-panel">
      <h2>Your projects</h2>
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      <h3>Pinned</h3>
      <div className="connected-actions">
        {r.data?.items
          .filter((p) => p.pinned)
          .map((p) => (
            <Link key={p.id} href={"/board-room/projects/" + p.id}>
              {p.name}
            </Link>
          ))}
      </div>
      <h3>Recently opened</h3>
      <div className="connected-actions">
        {r.data?.items
          .filter((p) => !p.pinned)
          .slice(0, 8)
          .map((p) => (
            <Link key={p.id} href={"/board-room/projects/" + p.id}>
              {p.name}
            </Link>
          ))}
      </div>
      {r.data?.items.length === 0 && (
        <p>Open a project to add it to your recent work.</p>
      )}
    </section>
  );
}
export function workspaceContextKey(email: string, room: string) {
  return (
    "evolve-context-v1:" + encodeURIComponent(email.toLowerCase()) + ":" + room
  );
}
export function useRememberedWorkspace(
  email: string,
  room: "locker" | "board",
) {
  useEffect(() => {
    const remember = () => {
      const path = location.pathname + location.search + location.hash;
      if (path.startsWith(room === "locker" ? "/app" : "/board-room")) {
        try {
          sessionStorage.setItem(workspaceContextKey(email, room), path);
        } catch {}
      }
    };
    remember();
    window.addEventListener("evolve:context", remember);
    window.addEventListener("popstate", remember);
    return () => {
      window.removeEventListener("evolve:context", remember);
      window.removeEventListener("popstate", remember);
    };
  });
}
export function useRoomLocations(email: string) {
  const [locations, setLocations] = useState({
    locker: "/app",
    board: "/board-room",
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = { locker: "/app", board: "/board-room" };
      for (const room of ["locker", "board"] as const) {
        try {
          const v = sessionStorage.getItem(workspaceContextKey(email, room));
          if (
            v &&
            (v === next[room] ||
              v.startsWith(next[room] + "?") ||
              (room === "board" && v.startsWith("/board-room/projects/")))
          )
            next[room] = v;
        } catch {}
      }
      setLocations(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [email]);
  return locations;
}
