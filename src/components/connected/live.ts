"use client";
import { useEffect, useRef, useState } from "react";
import { changed } from "./data";
export function useWorkspaceLive(refresh?: () => void, initialRevision = 0) {
  const initialRevisionRef = useRef(initialRevision),
    ref = useRef(refresh);
  useEffect(() => {
    ref.current = refresh;
  }, [refresh]);
  const [state, setState] = useState("Connecting");
  useEffect(() => {
    let e: EventSource | undefined,
      firstConnection = true,
      cursor = initialRevisionRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      if (!navigator.onLine) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (navigator.onLine) {
          changed();
          ref.current?.();
        }
      }, 180);
    }
    function connect() {
      e?.close();
      if (!navigator.onLine) {
        setState("Offline · data may be stale");
        return;
      }
      e = new EventSource("/api/events?since=" + cursor);
      e.addEventListener("ready", (event) => {
        if (!navigator.onLine) return;
        const payload = JSON.parse((event as MessageEvent).data);
        setState(payload.transport === "postgres" ? "Live" : "Polling updates");
        if (firstConnection) firstConnection = false;
        else update();
      });
      e.addEventListener("workspace", (event) => {
        const next = Number((event as MessageEvent).lastEventId);
        if (Number.isSafeInteger(next) && next >= cursor) cursor = next;
        update();
      });
      e.addEventListener("degraded", () => setState("Updates delayed"));
      e.addEventListener("revoked", () => {
        e?.close();
        location.reload();
      });
      e.onerror = () =>
        setState(
          navigator.onLine ? "Reconnecting" : "Offline · data may be stale",
        );
    }
    connect();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") update();
    }, 45000);
    const focus = () => {
      if (document.visibilityState === "visible") update();
    };
    const offline = () => {
      clearTimeout(timer);
      e?.close();
      setState("Offline · data may be stale");
    };
    const online = () => {
      setState("Reconnecting");
      connect();
      update();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      e?.close();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  return state;
}
