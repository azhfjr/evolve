import { templateDraftDefinitionSchema } from "../project-template/model";
const PREFIX = "evolve-form-draft-v1:";
export function formDraftKey(email: string, kind: string, id: string) {
  return (
    PREFIX + encodeURIComponent(email.toLowerCase()) + ":" + kind + ":" + id
  );
}
export function encodeFormDraft(
  values: Record<string, unknown>,
  now = Date.now(),
) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (/file|token|password|secret/i.test(k)) continue;
    if (k === "templateDefinition") {
      const parsed = templateDraftDefinitionSchema.safeParse(v);
      if (parsed.success) safe[k] = parsed.data;
      continue;
    }
    if (
      k === "customValues" &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      const entries = Object.entries(v);
      if (
        entries.length <= 20 &&
        entries.every(
          ([key, value]) =>
            /^[a-z][a-z0-9_]{0,47}$/.test(key) &&
            (value === null ||
              (typeof value === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  value,
                ))),
        )
      )
        safe[k] = Object.fromEntries(entries);
      continue;
    }
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null ||
      (Array.isArray(v) && v.every((x) => typeof x === "string"))
    )
      safe[k] = v;
  }
  return JSON.stringify({ savedAt: now, values: safe });
}
export function decodeFormDraft(
  raw: string | null,
  now = Date.now(),
): Record<string, unknown> | null {
  try {
    const r = JSON.parse(raw || "null");
    if (
      !r ||
      typeof r.savedAt !== "number" ||
      r.savedAt > now ||
      now - r.savedAt > 7 * 86400000 ||
      !r.values ||
      typeof r.values !== "object" ||
      Array.isArray(r.values)
    )
      return null;
    return JSON.parse(encodeFormDraft(r.values, now)).values;
  } catch {
    return null;
  }
}
export function clearBrowserDrafts() {
  window.dispatchEvent(new Event("evolve:clear-drafts"));
  try {
    localStorage.setItem(
      "evolve-draft-logout-v1",
      String(Date.now()) + ":" + crypto.randomUUID(),
    );
  } catch {}
  try {
    const channel = new BroadcastChannel("evolve-draft-lifecycle");
    channel.postMessage("logout");
    channel.close();
  } catch {}
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[kind];
      for (let i = storage.length - 1; i >= 0; i--) {
        const k = storage.key(i);
        if (k && (k.startsWith(PREFIX) || k.startsWith("evolve-task-draft-")))
          storage.removeItem(k);
      }
    } catch {}
  }
}
