import { documentPurposeSchema, type DocumentPurpose } from "./document-model";
import { z } from "zod";
export const WORKSPACE_FILE_LIMIT = 1024 * 1024 * 1024;
export const fileRoomSchema = z.enum(["locker", "board"]);
export type FileRoom = z.infer<typeof fileRoomSchema>;
export const fileQuerySchema = z.object({
  room: z.enum(["locker", "board", "all"]).default("locker"),
  purpose: z
    .union([documentPurposeSchema, z.literal("all"), z.literal("unlabelled")])
    .default("all"),
  q: z.string().trim().max(160).default(""),
  history: z.enum(["current", "all"]).default("current"),
  type: z
    .enum([
      "all",
      "task",
      "taskDraft",
      "project",
      "boardRoomProject",
      "avatar",
      "workspace",
    ])
    .default("all"),
  state: z.enum(["all", "ready", "pending", "deleting"]).default("all"),
  sort: z.enum(["newest", "oldest", "largest"]).default("newest"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export const deleteFilesSchema = z
  .object({
    room: fileRoomSchema.default("locker"),
    ids: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose unique files.",
      ),
  })
  .strict();
export type ManagedFile = {
  archived?: boolean;
  documentId?: string | null;
  versionNumber?: number;
  isCurrent?: boolean;
  id: string;
  filename: string;
  purpose?: DocumentPurpose | null;
  room?: FileRoom;
  projectId?: string | null;
  projectName?: string | null;
  taskName?: string | null;
  contentType: string;
  size: number;
  ownerEmail: string;
  createdAt: string;
  entityType: string;
  entityId: string;
  state: string;
  context: string;
  readable: boolean;
  canRetryCleanup?: boolean;
};
export type FileInventory = {
  items: ManagedFile[];
  total: number;
  page: number;
  limit: number;
  usage: {
    breakdown: Record<
      "locker" | "board" | "sharedAssets",
      { bytes: number; count: number }
    >;
    roomBytes?: number;
    roomCount?: number;
    bytes: number;
    limit: number;
    ready: number;
    pending: number;
    deleting: number;
    count: number;
  };
};
export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const unit = size >= 1024 ** 3 ? 3 : size >= 1024 ** 2 ? 2 : 1;
  return `${(size / 1024 ** unit).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${["B", "KB", "MB", "GB"][unit]}`;
}

export type FileRemovalReferences = {
  profiles: { email: string; version: number }[];
  workspaceVersion: number | null;
};
