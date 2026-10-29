"use client";
import { useEffect, useRef, useState } from "react";
import { useDraftSession, DRAFT_SESSION_ENDED } from "./draft-session";
import {
  decodeFormDraft,
  encodeFormDraft,
  formDraftKey,
} from "@/lib/connected/drafts";
export function FormDraftRecovery({
  email,
  version,
  kind,
  id = "new",
  formRef,
  extra = {},
  onRestore,
  onReady,
}: {
  email: string;
  version?: number;
  kind: string;
  id?: string;
  formRef: React.RefObject<HTMLFormElement | null>;
  extra?: Record<string, unknown>;
  onRestore: (values: Record<string, unknown>) => void;
  onReady?: (clear: () => void) => void;
}) {
  const key = formDraftKey(email, kind, id),
    [saved, setSaved] = useState<Record<string, unknown> | null>(null),
    [status, setStatus] = useState(""),
    resolved = useRef(false),
    extraRef = useRef(extra),
    versionRef = useRef(version),
    extraSignature = useRef(JSON.stringify(extra)),
    readyRef = useRef(onReady);
  const { ended: sessionEnded, active: sessionActive } = useDraftSession(
    formRef,
    [key],
  );
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    extraRef.current = extra;
    const signature = JSON.stringify(extra);
    if (signature !== extraSignature.current) {
      extraSignature.current = signature;
      formRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [extra, formRef]);
  useEffect(() => {
    versionRef.current = version;
  }, [version]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const value = decodeFormDraft(localStorage.getItem(key));
        setSaved(value);
        resolved.current = !value;
      } catch {
        resolved.current = true;
        setStatus("Draft recovery unavailable in this browser.");
      }
      readyRef.current?.(() => {
        try {
          localStorage.removeItem(key);
        } catch {}
        resolved.current = false;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    const flush = (announce = true) => {
      clearTimeout(timer);
      if (!sessionActive() || !pending || !resolved.current) return;
      pending = false;
      const values: Record<string, unknown> = {};
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string")
          values[k] = v === "__evolve_empty_option__" ? "" : v;
      });
      Object.assign(values, extraRef.current);
      if (versionRef.current !== undefined)
        values.__baseVersion = versionRef.current;
      try {
        localStorage.setItem(key, encodeFormDraft(values));
        if (announce) setStatus("Draft saved on this browser");
      } catch {
        if (announce)
          setStatus("Draft recovery unavailable. Keep this page open.");
      }
    };
    const save = () => {
      if (!sessionActive() || !resolved.current) return;
      pending = true;
      setStatus("Unsaved changes");
      clearTimeout(timer);
      timer = setTimeout(() => flush(), 500);
    };
    const leaving = () => flush(false);
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    window.addEventListener("pagehide", leaving);
    return () => {
      flush(false);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      window.removeEventListener("pagehide", leaving);
    };
  }, [formRef, key, sessionActive]);
  return (
    <div className="connected-draft" role="status">
      {sessionEnded ? (
        <p>{DRAFT_SESSION_ENDED}</p>
      ) : saved ? (
        <>
          <p>A saved draft is available. Files must be selected again.</p>
          <button
            type="button"
            onClick={() => {
              const form = formRef.current;
              for (const [k, v] of Object.entries(saved)) {
                const element = form?.elements.namedItem(k);
                if (
                  (element instanceof HTMLInputElement &&
                    element.type !== "file") ||
                  element instanceof HTMLTextAreaElement
                ) {
                  const setter = Object.getOwnPropertyDescriptor(
                    element instanceof HTMLTextAreaElement
                      ? HTMLTextAreaElement.prototype
                      : HTMLInputElement.prototype,
                    "value",
                  )?.set;
                  setter?.call(element, String(v ?? ""));
                  element.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
              onRestore(saved);
              resolved.current = true;
              setSaved(null);
              setStatus("Draft restored. Review before saving.");
            }}
          >
            Restore draft
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(key);
              } catch {}
              resolved.current = true;
              setSaved(null);
            }}
          >
            Discard draft
          </button>
        </>
      ) : (
        <small>{status}</small>
      )}
    </div>
  );
}
