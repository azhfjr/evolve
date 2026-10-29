"use client";
import {
  encodeBoardRequest,
  IMPORT_SIZE_ERROR,
} from "@/lib/board-room/transport";
import { useState, useEffect, useCallback } from "react";
export async function connectedRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const encoded = body === undefined ? undefined : encodeBoardRequest(body);
  let response: Response;
  try {
    response = await fetch(url, {
      method: encoded === undefined ? "GET" : "POST",
      headers:
        encoded === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body: encoded,
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new Error(
      "Check your connection and retry. Changes have not been confirmed.",
    );
  }
  const fallback =
    response.status === 413
      ? IMPORT_SIZE_ERROR
      : response.status === 401
        ? "Sign in again to continue. Changes have not been confirmed."
        : response.status === 403
          ? "You do not have permission for this action."
          : response.status === 409
            ? "This record changed. Review the latest version before retrying; your input is preserved."
            : "Evolve is temporarily unavailable. Please retry; changes have not been confirmed.";
  let data: T;
  try {
    data = await response.json();
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new Error(fallback);
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data ? data.error : null;
    throw new Error(
      response.status !== 413 && typeof message === "string"
        ? message
        : fallback,
    );
  }
  return data;
}
export function useConnectedData<T>(url: string, pinFirstResult = false) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!url) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      connectedRequest<T>(url, undefined, c.signal)
        .then((v) => {
          setData((previous) => (pinFirstResult && previous ? previous : v));
          setBusy(false);
        })
        .catch((e) => {
          if (!c.signal.aborted) {
            setError(e.message);
            setBusy(false);
          }
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [url, revision, pinFirstResult]);
  useEffect(() => {
    const listener = () => retry();
    window.addEventListener("evolve:changed", listener);
    return () => window.removeEventListener("evolve:changed", listener);
  }, [retry]);
  return { data, error, busy, retry };
}
export function changed() {
  window.dispatchEvent(new Event("evolve:changed"));
}
