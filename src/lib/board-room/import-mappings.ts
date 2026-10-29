import { z } from "zod";
import { CSV_COLUMNS, type ColumnMapping } from "./csv";
const columns = [
  "externalId",
  ...Object.keys(CSV_COLUMNS).filter((k) => k !== "externalId"),
  "assetCodes",
] as [
  keyof typeof CSV_COLUMNS | "assetCodes",
  ...(keyof typeof CSV_COLUMNS | "assetCodes")[],
];
const mappingSchema = z
  .partialRecord(z.enum(columns), z.string().trim().min(1).max(180))
  .refine(
    (m) =>
      Boolean(m.externalId) &&
      new Set(Object.values(m)).size === Object.values(m).length,
  );
const savedSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(60),
    mapping: mappingSchema,
  })
  .strict();
export type SavedMapping = z.infer<typeof savedSchema>;
export function mappingStorageKey(email: string) {
  return `evolve:board-import-mapping:v1:${email.trim().toLowerCase()}`;
}
export function readSavedMapping(source: string | null): SavedMapping | null {
  if (!source || source.length > 12000) return null;
  try {
    const result = savedSchema.safeParse(JSON.parse(source));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function serializeSavedMapping(name: string, mapping: ColumnMapping) {
  const fields = Object.fromEntries(
    Object.entries(mapping).filter(([, v]) => Boolean(v)),
  );
  return JSON.stringify(
    savedSchema.parse({ version: 1, name, mapping: fields }),
  );
}
export function mappingForHeaders(
  mapping: ColumnMapping,
  headers: string[],
): ColumnMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(
      ([, value]) => value && headers.includes(value),
    ),
  );
}
