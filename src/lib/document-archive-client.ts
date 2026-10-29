import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { documentIndex, type ArchiveFile } from "./document-model";
// One bounded ZIP part at a time. No archive is uploaded or stored server-side.
export async function buildDocumentArchive(
  files: ArchiveFile[],
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let failed: Error | undefined;
  let finished = false;
  const zip = new Zip((error, data, final) => {
    if (error) {
      failed = error;
      return;
    }
    chunks.push(new Uint8Array(data));
    if (final) finished = true;
  });
  const total = files.reduce((n, f) => n + f.size, 0);
  let loaded = 0;
  try {
    for (const file of files) {
      signal.throwIfAborted();
      const response = await fetch(
        `/api/attachments/${file.id}/content?download=1`,
        { signal, cache: "no-store" },
      );
      if (!response.ok || !response.body)
        throw new Error(
          `${file.filename} is unavailable. Refresh the list and retry; no incomplete archive was saved.`,
        );
      const entry = new ZipPassThrough(file.path);
      zip.add(entry);
      const reader = response.body.getReader();
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > file.size || size > 25 * 1024 * 1024)
            throw new Error("Document size changed. Refresh and retry.");
          entry.push(value, false);
          loaded += value.length;
          onProgress(loaded, total);
          if (failed) throw failed;
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      if (size !== file.size)
        throw new Error(
          `${file.filename} was interrupted. Retry this ZIP part.`,
        );
      entry.push(new Uint8Array(), true);
    }
    const index = new ZipPassThrough("document-index.csv");
    zip.add(index);
    index.push(strToU8(documentIndex(files)), true);
    zip.end();
    signal.throwIfAborted();
    if (failed) throw failed;
    if (!finished)
      throw new Error("Archive could not be completed. Retry this part.");
    return new Blob(chunks, { type: "application/zip" });
  } catch (error) {
    zip.terminate();
    throw error;
  }
}
