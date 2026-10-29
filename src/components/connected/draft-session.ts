"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { toast } from "sonner";
export const DRAFT_SESSION_ENDED =
  "You signed out. Reload and sign in before continuing; browser drafts were cleared.";
type DocumentSession = { marker: string | null | undefined; ended: boolean };
const documentSessions = new WeakMap<Document, DocumentSession>();
function logoutMarker() {
  try {
    return localStorage.getItem("evolve-draft-logout-v1");
  } catch {
    return undefined;
  }
}
function documentSession() {
  let session = documentSessions.get(document);
  if (!session) {
    session = { marker: logoutMarker(), ended: false };
    documentSessions.set(document, session);
  }
  return session;
}
// Capture the shell's lifecycle before any editor opens; never reset it on remount.
if (typeof document !== "undefined") documentSession();
function markerChanged(session: DocumentSession) {
  const current = logoutMarker();
  return (
    session.marker !== undefined &&
    current !== undefined &&
    current !== session.marker
  );
}
/** A mounted editor cannot revive a draft after any tab ends its session. */
export function useDraftSession(
  formRef: RefObject<HTMLFormElement | null>,
  keys: string[],
  enabled = true,
) {
  const [ended, setEnded] = useState(false);
  const stopped = useRef(false),
    invalidate = useRef<() => void>(() => {});
  const signature = JSON.stringify(keys);
  const active = useCallback(() => {
    if (!enabled) return true;
    const page = documentSession();
    if (stopped.current || page.ended) return false;
    if (markerChanged(page)) {
      invalidate.current();
      return false;
    }
    return true;
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const page = documentSession();
    const clear = () => {
      stopped.current = true;
      page.ended = true;
      for (const key of JSON.parse(signature) as string[])
        try {
          localStorage.removeItem(key);
        } catch {}
      if (formRef.current) formRef.current.inert = true;
      setEnded(true);
      toast.error(DRAFT_SESSION_ENDED, { id: "draft-session-ended" });
    };
    invalidate.current = clear;
    const storage = (e: StorageEvent) => {
      if (e.key === "evolve-draft-logout-v1" && e.newValue) clear();
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("evolve-draft-lifecycle");
      channel.onmessage = (e) => {
        if (e.data === "logout") clear();
      };
    } catch {}
    const form = formRef.current;
    const blockSubmit = (event: Event) => {
      if (!active()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    form?.addEventListener("submit", blockSubmit, true);
    window.addEventListener("evolve:clear-drafts", clear);
    window.addEventListener("storage", storage);
    if (page.ended || markerChanged(page)) clear();
    return () => {
      channel?.close();
      form?.removeEventListener("submit", blockSubmit, true);
      window.removeEventListener("evolve:clear-drafts", clear);
      window.removeEventListener("storage", storage);
    };
  }, [formRef, signature, enabled, active]);
  return { ended, active };
}
