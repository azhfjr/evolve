"use client";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import type { WorkspaceData } from "@/lib/types";
import { connectionQuerySchema, demoConnections } from "@/lib/connection-model";

export function useConnectionData<T>(
  data: WorkspaceData,
  demo: boolean,
  parameters: URLSearchParams,
  schema: z.ZodType<T>,
  enabled = true,
) {
  const query = parameters.toString(),
    [retry, setRetry] = useState(0);
  const signature = `${query}|${data.revision || 0}|${retry}`;
  const [remote, setRemote] = useState<{
    signature: string;
    query: string;
    data?: T;
    error?: string;
  } | null>(null);
  const local = useMemo(
    () =>
      demo && enabled
        ? schema.parse(
            demoConnections(
              data,
              connectionQuerySchema.parse(
                Object.fromEntries(new URLSearchParams(query)),
              ),
            ),
          )
        : null,
    [data, demo, enabled, query, schema],
  );
  useEffect(() => {
    if (demo || !enabled) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timeout = setTimeout(() => {
        if (!controller.signal.aborted) {
          setRemote((previous) => ({
            signature,
            query,
            data: previous?.query === query ? previous.data : undefined,
            error: "Connections took too long to load. Please try again.",
          }));
          controller.abort();
        }
      }, 15000);
      fetch(`/api/connections?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error || "Connections could not be loaded.");
          return schema.parse(body);
        })
        .then((result) => {
          if (!controller.signal.aborted)
            setRemote({ signature, query, data: result });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setRemote((previous) => ({
              signature,
              query,
              data: previous?.query === query ? previous.data : undefined,
              error: error.message,
            }));
        })
        .finally(() => clearTimeout(timeout));
    }, 120);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [demo, enabled, query, schema, signature]);
  return {
    result: demo ? local : remote?.query === query ? remote.data : null,
    error: remote?.signature === signature ? remote.error : undefined,
    loading: enabled && !demo && remote?.signature !== signature,
    retry: () => setRetry((v) => v + 1),
  };
}
