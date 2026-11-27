import type { DocumentPurpose } from "./document-model";
export type AttachmentEntity =
  | "task"
  | "taskDraft"
  | "project"
  | "boardRoomProject"
  | "avatar"
  | "workspace";
export type AttachmentInfo = {
  documentDate?: string | null;
  documentVersion?: number;
  documentId?: string | null;
  versionNumber?: number;
  isCurrent?: boolean;
  id: string;
  filename: string;
  purpose?: DocumentPurpose | null;
  contentType: string;
  size: number;
  ownerEmail: string;
  createdAt: string;
};
export type StorageProvider = "local" | "blob" | "r2";
export type UploadReservation = {
  file?: AttachmentInfo;
  id: string;
  storagePath: string;
  provider: StorageProvider;
  upload?: { url: string; headers: Record<string, string> };
  contentType: string;
};
