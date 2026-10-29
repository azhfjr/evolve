"use client";
import { useSearchParams } from "next/navigation";
import {
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
function subscribe(notify: () => void) {
  window.addEventListener("evolve:context", notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("evolve:context", notify);
    window.removeEventListener("popstate", notify);
  };
}
// URL-backed state retains navigation context without replacing editor inputs.
export function useURLState<T>(
  key: string,
  initial: T,
  valid?: (value: unknown) => boolean,
): [T, Dispatch<SetStateAction<T>>] {
  const params = useSearchParams();
  function decode(raw: string | null): T {
    if (raw === null || raw.length > 4096) return initial;
    try {
      const value = typeof initial === "string" ? raw : JSON.parse(raw);
      if (
        valid
          ? valid(value)
          : typeof initial === "number"
            ? Number.isSafeInteger(value) && value > 0
            : typeof value === typeof initial
      )
        return value as T;
    } catch {}
    return initial;
  }
  const search = useSyncExternalStore(
    subscribe,
    () => location.search,
    () => "?" + params.toString(),
  );
  const value = decode(new URLSearchParams(search).get(key));
  const set: Dispatch<SetStateAction<T>> = (next) => {
    const url = new URL(location.href),
      current = decode(url.searchParams.get(key));
    const resolved =
      typeof next === "function" ? (next as (v: T) => T)(current) : next;
    if (JSON.stringify(resolved) === JSON.stringify(initial))
      url.searchParams.delete(key);
    else
      url.searchParams.set(
        key,
        typeof initial === "string"
          ? String(resolved)
          : JSON.stringify(resolved),
      );
    history.replaceState(null, "", url);
    window.dispatchEvent(new Event("evolve:context"));
  };
  return [value, set];
}
