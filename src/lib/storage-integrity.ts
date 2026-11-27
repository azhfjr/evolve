import { createHash } from "node:crypto";

export async function verifyStoredBytes(
  stream: ReadableStream<Uint8Array>,
  expected: number,
) {
  if (expected <= 0 || expected > 25 * 1024 * 1024)
    throw new Error("Invalid attachment size in migration.");
  const reader = stream.getReader();
  const bytes = Buffer.alloc(expected);
  const hash = createHash("sha256");
  const deadline = AbortSignal.timeout(30000);
  const stop = () => void reader.cancel().catch(() => {});
  deadline.addEventListener("abort", stop, { once: true });
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      deadline.throwIfAborted();
      if (done) break;
      if (length + value.length > expected)
        throw new Error("Stored file is larger than its reservation.");
      bytes.set(value, length);
      hash.update(value);
      length += value.length;
    }
    if (length !== expected)
      throw new Error("Stored file is shorter than its reservation.");
    return { bytes, sha256: hash.digest("hex") };
  } finally {
    deadline.removeEventListener("abort", stop);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
