"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui";
import {
  decodeFormDraft,
  encodeFormDraft,
  formDraftKey,
} from "@/lib/connected/drafts";
import {
  templateDraftDefinitionSchema,
  type TemplateDefinition,
} from "@/lib/project-template/model";
type Guard = {
  dirty: () => boolean;
  busy: () => boolean;
  persist: () => boolean;
  leave: (keep: boolean) => boolean;
};
const Navigation = createContext<{
  register: (g: Guard | null) => void;
  navigate: (run: () => void) => void;
  checkpoint: () => void;
  push: (url: string) => void;
}>({
  register: () => {},
  navigate: (run) => run(),
  checkpoint: () => {},
  push: () => {},
});
export function TemplateNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const guard = useRef<Guard | null>(null),
    pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  const entry = useRef<{
    url: string;
    state: Record<string, unknown>;
    position: number;
  } | null>(null);
  const undoing = useRef(false);
  const checkpoint = useCallback(() => {
    const position = Number.isSafeInteger(history.state?.evolveBoardPosition)
      ? history.state.evolveBoardPosition
      : (entry.current?.position ?? 0);
    const state = { ...history.state, evolveBoardPosition: position };
    if (history.state?.evolveBoardPosition !== position)
      history.replaceState(state, "", location.href);
    entry.current = { url: location.href, state, position };
  }, []);
  const push = useCallback(
    (url: string) => {
      const position = (entry.current?.position ?? 0) + 1;
      history.pushState(
        { ...history.state, evolveBoardPosition: position },
        "",
        url,
      );
      checkpoint();
    },
    [checkpoint],
  );
  useLayoutEffect(checkpoint, [checkpoint]);
  useLayoutEffect(() => {
    const pop = (event: PopStateEvent) => {
      if (undoing.current) {
        event.stopImmediatePropagation();
        undoing.current = false;
        checkpoint();
        setOpen(true);
        return;
      }
      const old = entry.current;
      if (!guard.current?.dirty() || guard.current.persist()) {
        if (!Number.isSafeInteger(event.state?.evolveBoardPosition))
          history.replaceState(
            { ...history.state, evolveBoardPosition: (old?.position ?? 0) - 1 },
            "",
            location.href,
          );
        checkpoint();
        return;
      }
      event.stopImmediatePropagation();
      setError(
        "Browser draft could not be saved. Keep editing, or explicitly discard your changes.",
      );
      const target = event.state?.evolveBoardPosition;
      const delta =
        old && Number.isSafeInteger(target) ? old.position - target : 0;
      if (old && delta) {
        pending.current = () => history.go(-delta);
        undoing.current = true;
        history.go(delta);
      } else if (old) {
        // Prior entries outside this Board session have no position marker.
        // Restore the editor as a new entry; the requested destination remains immediately behind it.
        history.pushState(old.state, "", old.url);
        pending.current = () => history.back();
        setOpen(true);
      }
    };
    window.addEventListener("popstate", pop, true);
    return () => window.removeEventListener("popstate", pop, true);
  }, [checkpoint]);
  const register = useCallback((g: Guard | null) => {
    guard.current = g;
  }, []);
  const navigate = useCallback((run: () => void) => {
    if (guard.current?.busy()) return;
    if (!guard.current?.dirty()) {
      run();
      return;
    }
    pending.current = run;
    setError("");
    setOpen(true);
  }, []);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const url = new URL(link.href, location.href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.href === location.href ||
        (url.pathname === location.pathname &&
          url.search === location.search &&
          url.hash)
      )
        return;
      if (!guard.current?.dirty() && !guard.current?.busy()) return;
      event.preventDefault();
      event.stopPropagation();
      navigate(() =>
        url.origin === location.origin
          ? router.push(url.pathname + url.search + url.hash)
          : location.assign(url.href),
      );
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [navigate, router]);
  function leave(keep: boolean) {
    if (!guard.current?.leave(keep)) {
      setError(
        "Browser draft could not be saved. Keep editing, or explicitly discard your changes.",
      );
      return;
    }
    const run = pending.current;
    pending.current = null;
    setOpen(false);
    run?.();
  }
  return (
    <Navigation.Provider value={{ register, navigate, checkpoint, push }}>
      {children}
      {open && (
        <Modal
          open
          className="br-modal br-shared-modal"
          title="Leave unsaved project template?"
          description="Choose how to handle changes that have not been saved to Evolve."
          onClose={() => setOpen(false)}
        >
          <div className="connected-form">
            <p>
              Your project template changes have not been saved to the server.
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="connected-actions">
              <button autoFocus onClick={() => setOpen(false)}>
                Keep editing
              </button>
              <button disabled={!!error} onClick={() => leave(true)}>
                Leave and keep browser draft
              </button>
              <button onClick={() => leave(false)}>Discard and leave</button>
            </div>
          </div>
        </Modal>
      )}
    </Navigation.Provider>
  );
}
export const useTemplateNavigation = () => useContext(Navigation);
export function useTemplateRecovery(
  email: string,
  definition: TemplateDefinition,
  version: number,
  dirty: boolean,
  busy: boolean,
  restore: (definition: TemplateDefinition, version: number) => void,
) {
  const { register, checkpoint } = useTemplateNavigation();
  const key = formDraftKey(email, "project-template", "primary");
  const current = useRef({ definition, version, dirty, busy });
  useLayoutEffect(() => {
    current.current = { definition, version, dirty, busy };
    checkpoint();
  }, [definition, version, dirty, busy, checkpoint]);
  const released = useRef(false),
    resolved = useRef(false);
  const lifecycle = useRef<string | null>(null);
  const [ready, setReady] = useState(false),
    [saved, setSaved] = useState<{
      definition: TemplateDefinition;
      version: number;
    } | null>(null),
    [status, setStatus] = useState(""),
    [sessionEnded, setSessionEnded] = useState(false);
  const persist = useCallback(
    (announce = false) => {
      if (!current.current.dirty || released.current || !resolved.current)
        return true;
      try {
        if (
          localStorage.getItem("evolve-draft-logout-v1") !== lifecycle.current
        ) {
          released.current = true;
          return false;
        }
        localStorage.setItem(
          key,
          encodeFormDraft({
            templateDefinition: current.current.definition,
            __baseVersion: current.current.version,
          }),
        );
        if (announce) setStatus("Draft saved on this browser");
        return true;
      } catch {
        if (announce)
          setStatus("Draft recovery unavailable. Keep this page open.");
        return false;
      }
    },
    [key],
  );
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
      current.current.dirty = false;
    } catch {
      return false;
    }
    return true;
  }, [key]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        lifecycle.current = localStorage.getItem("evolve-draft-logout-v1");
        const raw = localStorage.getItem(key),
          value = decodeFormDraft(raw);
        const parsed = templateDraftDefinitionSchema.safeParse(
          value?.templateDefinition,
        );
        if (
          parsed.success &&
          Number.isSafeInteger(value?.__baseVersion) &&
          Number(value?.__baseVersion) > 0
        ) {
          setSaved({
            definition: parsed.data,
            version: Number(value!.__baseVersion),
          });
          resolved.current = false;
        } else {
          if (raw) localStorage.removeItem(key);
          resolved.current = true;
        }
      } catch {
        resolved.current = true;
        setStatus("Draft recovery unavailable in this browser.");
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    if (!ready || !dirty || saved) return;
    const timer = setTimeout(() => persist(true), 500);
    return () => clearTimeout(timer);
  }, [definition, version, dirty, ready, saved, persist]);
  useEffect(() => {
    register({
      dirty: () => current.current.dirty && !released.current,
      busy: () => current.current.busy,
      persist: () => persist(),
      leave: (keep) => {
        if (keep && !persist()) return false;
        if (!keep) clear();
        released.current = true;
        return true;
      },
    });
    const flush = () => {
      persist();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (current.current.dirty && !released.current) {
        persist();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const logout = () => {
      released.current = true;
      try {
        localStorage.removeItem(key);
      } catch {}
      setSessionEnded(true);
      setStatus(
        "You signed out. Reload and sign in before continuing; browser drafts were cleared.",
      );
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("evolve-draft-lifecycle");
      channel.onmessage = (e) => {
        if (e.data === "logout") logout();
      };
    } catch {}
    const storage = (e: StorageEvent) => {
      if (e.key === "evolve-draft-logout-v1" && e.newValue) logout();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("evolve:clear-drafts", logout);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("pagehide", flush);
    window.addEventListener("popstate", flush);
    return () => {
      persist();
      register(null);
      channel?.close();
      window.removeEventListener("storage", storage);
      window.removeEventListener("evolve:clear-drafts", logout);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("popstate", flush);
    };
  }, [register, clear, persist, key]);
  return {
    ready: ready && !saved && !sessionEnded,
    clear,
    banner: (
      <div className="connected-draft" role="status">
        {saved && !sessionEnded ? (
          <>
            <p>
              A saved template draft is available on this browser. Review before
              saving.
            </p>
            <div className="connected-actions">
              <button
                onClick={() => {
                  restore(saved.definition, saved.version);
                  resolved.current = true;
                  setSaved(null);
                  setStatus("Draft restored. Review before saving.");
                }}
              >
                Restore draft
              </button>
              <button
                onClick={() => {
                  if (clear()) {
                    resolved.current = true;
                    setSaved(null);
                  } else
                    setStatus("Unable to discard the saved browser draft.");
                }}
              >
                Discard draft
              </button>
            </div>
          </>
        ) : (
          <small>{status}</small>
        )}
      </div>
    ),
  };
}
