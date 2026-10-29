import { z } from "zod";
export const documentDateSchema = z.iso
  .date()
  .refine(
    (value) => value >= "0001-01-01" && value <= "9999-12-31",
    "Use a calendar date between 0001 and 9999.",
  );
export const documentMetadataSchema = z
  .object({
    documentDate: documentDateSchema.nullable(),
    expectedDocumentVersion: z.number().int().positive(),
  })
  .strict();
export const DOCUMENT_PURPOSES = [
  "Reference",
  "Meeting Notes",
  "KKP",
  "KKO",
  "KKF",
  "Simulation Files",
  "Other",
] as const;
export type DocumentPurpose = (typeof DOCUMENT_PURPOSES)[number];
export const documentPurposeSchema = z.enum(DOCUMENT_PURPOSES);
export const documentLabelSchema = z
  .object({
    purpose: documentPurposeSchema,
    expectedPurpose: documentPurposeSchema.nullable(),
  })
  .strict();
export const archiveRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      includeHistory: z.boolean().optional(),
      kind: z.literal("project"),
      room: z.enum(["locker", "board"]),
      id: z.uuid(),
    })
    .strict(),
  z
    .object({
      includeHistory: z.boolean().optional(),
      kind: z.literal("workspace"),
      room: z.enum(["locker", "board"]).optional(),
    })
    .strict(),
  z
    .object({
      includeHistory: z.boolean().optional(),
      kind: z.literal("selection"),
      room: z.enum(["locker", "board"]).optional(),
      ids: z
        .array(z.uuid())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
]);
export type ArchiveRequest = z.infer<typeof archiveRequestSchema>;
export type ArchiveFile = {
  id: string;
  filename: string;
  size: number;
  purpose: DocumentPurpose | null;
  ownerEmail: string;
  createdAt: string;
  room: "locker" | "board";
  projectId: string | null;
  projectName: string;
  taskName: string | null;
  path: string;
};
export type ArchiveManifest = {
  files: ArchiveFile[];
  excluded: number;
  bytes: number;
};
export function safeArchiveSegment(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
      .replace(/^\.+|[. ]+$/g, "")
      .trim()
      .slice(0, 100) || "Untitled"
  );
}
export function archiveFilePath(file: Omit<ArchiveFile, "path">) {
  const folder = `${file.room === "board" ? "Board Room" : "Locker Room"}/${safeArchiveSegment(file.projectName)}-${safeArchiveSegment(file.projectId || "unassigned")}/${file.taskName ? `Tasks/${safeArchiveSegment(file.taskName)}` : "Project documents"}`;
  return `${folder}/${file.id}-${safeArchiveSegment(file.filename)}`;
}
export const ARCHIVE_PART_BYTES = 100 * 1024 * 1024;
export function archiveParts(files: ArchiveFile[]) {
  const parts: ArchiveFile[][] = [];
  let part: ArchiveFile[] = [];
  let bytes = 0;
  for (const file of files) {
    if (file.size <= 0 || file.size > 25 * 1024 * 1024)
      throw new Error("Invalid document size in download manifest.");
    if (
      part.length &&
      (part.length >= 100 || bytes + file.size > ARCHIVE_PART_BYTES)
    ) {
      parts.push(part);
      part = [];
      bytes = 0;
    }
    part.push(file);
    bytes += file.size;
  }
  if (part.length) parts.push(part);
  return parts;
}
export function documentIndex(files: ArchiveFile[]) {
  const cell = (v: unknown) =>
    `"${String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  return [
    [
      "Path",
      "Purpose",
      "App",
      "Project",
      "Task",
      "Size",
      "Uploader",
      "Uploaded",
    ],
    ...files.map((f) => [
      f.path,
      f.purpose || "Unlabelled",
      f.room,
      f.projectName,
      f.taskName,
      f.size,
      f.ownerEmail,
      f.createdAt,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
