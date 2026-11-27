import type { StorageProvider } from "./attachment-types";
import { R2_FILE_LIMIT, WORKSPACE_FILE_LIMIT } from "./file-management-model";

export function uploadStorageProvider(): StorageProvider | null {
  switch (process.env.EVOLVE_STORAGE_WRITE_MODE) {
    case "paused":
      return null;
    case "r2":
      return "r2";
    case "blob":
      return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : null;
    case undefined:
      if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
      if (
        !process.env.VERCEL &&
        (process.env.NODE_ENV !== "production" ||
          process.env.EVOLVE_LOCAL_FILES === "1")
      )
        return "local";
      return null;
    default:
      return null;
  }
}

export function attachmentProvider(item: {
  storageProvider: StorageProvider | null;
}): StorageProvider {
  if (item.storageProvider) return item.storageProvider;
  // Legacy rows may still be written by a Blob-only deployment during staging.
  return process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN
    ? "blob"
    : "local";
}

export function sharedStorageLimit() {
  return process.env.EVOLVE_STORAGE_WRITE_MODE === "r2" ||
    (process.env.EVOLVE_STORAGE_WRITE_MODE === "paused" &&
      process.env.EVOLVE_STORAGE_EXPANDED_QUOTA === "1")
    ? R2_FILE_LIMIT
    : WORKSPACE_FILE_LIMIT;
}
