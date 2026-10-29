import { z } from "zod";
import { PRIMARY_CATEGORIES } from "../board-room/model";
import { readCSV } from "../board-room/csv";
export const ASSET_HEADERS = [
  "RUPTL Code",
  "Asset name",
  "Primary category",
  "Capacity",
  "Capacity unit",
  "Location",
  "Voltage",
  "Project ID",
] as const;
export const assetSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9._-]{0,79}$/, "Use a valid RUPTL code."),
    name: z.string().trim().min(1).max(160),
    category: z.enum(PRIMARY_CATEGORIES),
    capacity: z.number().finite().nonnegative().nullable().default(null),
    unit: z.string().trim().max(30).default(""),
    location: z.string().trim().max(160).default(""),
    voltage: z.string().trim().max(120).default(""),
    projectId: z.uuid().nullable().default(null),
  })
  .strict()
  .refine((v) => v.capacity === null || !!v.unit, "Capacity requires a unit.");
export type AssetValues = z.infer<typeof assetSchema>;
export type Asset = AssetValues & {
  id: string;
  version: number;
  updatedAt: string;
  projectName: string | null;
};
const fields = [
  "code",
  "name",
  "category",
  "capacity",
  "unit",
  "location",
  "voltage",
  "projectId",
] as const;
export type AssetPatch = Partial<AssetValues> & { code: string };
export function parseAssetCSV(
  source: string,
  mapping?: Record<string, string>,
): { row: number; values: AssetPatch }[] {
  const rows = readCSV(source);
  const headers = rows.shift()?.map((h) => h.trim()) || [];
  if (!rows.length) throw Error("CSV needs headers and at least one asset.");
  if (new Set(headers).size !== headers.length)
    throw Error("CSV column names must be unique.");
  const map = Object.fromEntries(
    fields.map((field, i) => [field, mapping?.[field] ?? ASSET_HEADERS[i]]),
  );
  if (!headers.includes(map.code)) throw Error("Map RUPTL Code.");
  const seen = new Set<string>();
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r, index) => {
      const values: Record<string, unknown> = {};
      for (const f of fields) {
        const at = headers.indexOf(map[f]);
        const raw = at < 0 ? "" : (r[at] ?? "").trim();
        if (!raw) continue;
        if (f === "capacity") {
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0)
            throw Error(`Row ${index + 2}: invalid capacity.`);
          values[f] = n;
        } else values[f] = raw;
      }
      const code = String(values.code ?? "").toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code))
        throw Error(`Row ${index + 2}: invalid RUPTL Code.`);
      if (seen.has(code)) throw Error(`Duplicate RUPTL Code ${code}.`);
      seen.add(code);
      values.code = code;
      return { row: index + 2, values: values as AssetPatch };
    });
}
export function assetCSVCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stableJSON(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
