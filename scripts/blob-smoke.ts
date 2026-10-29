import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { del, get, head } from "@vercel/blob";
import {
  generateClientTokenFromReadWriteToken,
  put,
} from "@vercel/blob/client";

let phase = "configuration";
async function main() {
  if (
    process.env.EVOLVE_RUN_BLOB_SMOKE !== "1" ||
    process.env.VERCEL_ENV !== "production" ||
    !process.env.BLOB_READ_WRITE_TOKEN
  )
    throw new Error(
      "Run this explicitly inside the approved production Vercel build only.",
    );
  const paths: string[] = [];
  try {
    for (const size of [256 * 1024, 11 * 1024 * 1024]) {
      const pathname = `evolve-storage-smoke/${randomUUID()}/probe.txt`;
      paths.push(pathname);
      const bytes = Buffer.alloc(size, 65);
      const expected = createHash("sha256").update(bytes).digest("hex");
      const token = await generateClientTokenFromReadWriteToken({
        pathname,
        maximumSizeInBytes: size,
        allowedContentTypes: ["text/plain"],
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil: Date.now() + 120000,
      });
      phase = `upload-${size}`;
      const started = performance.now();
      const item = await put(pathname, bytes, {
        access: "private",
        token,
        contentType: "text/plain",
        multipart: size > 5 * 1024 * 1024,
      });
      const uploaded = performance.now();
      phase = `metadata-${size}`;
      const metadata = await head(pathname);
      if (metadata.size !== size || metadata.contentType !== "text/plain")
        throw new Error(
          "Blob metadata does not match the attachment contract.",
        );
      phase = `readback-${size}`;
      const response = await get(pathname, {
        access: "private",
        useCache: false,
      });
      if (!response?.stream) throw new Error("Private Blob readback failed.");
      const hash = createHash("sha256");
      let read = 0;
      for await (const chunk of response.stream) {
        hash.update(chunk);
        read += chunk.byteLength;
      }
      if (read !== size || hash.digest("hex") !== expected)
        throw new Error("Blob byte verification failed.");
      phase = `anonymous-${size}`;
      const anonymous = await fetch(item.url, {
        method: "GET",
        headers: { Range: "bytes=0-7" },
        signal: AbortSignal.timeout(10000),
      });
      await anonymous.body?.cancel();
      if (anonymous.ok)
        throw new Error("Blob must reject anonymous downloads.");
      console.log(
        "BLOB_SMOKE",
        JSON.stringify({
          sizeBytes: size,
          multipart: size > 5 * 1024 * 1024,
          uploadMs: Math.round(uploaded - started),
          verificationMs: Math.round(performance.now() - uploaded),
          sha256Matches: true,
          anonymousStatus: anonymous.status,
        }),
      );
    }
  } finally {
    const priorPhase = phase;
    phase = "cleanup";
    await del(paths);
    phase = priorPhase;
    console.log(
      "BLOB_SMOKE_CLEANUP",
      JSON.stringify({ removed: paths.length }),
    );
  }
}
main().catch((error) => {
  // Never log SDK payloads, signed URLs, tokens or environment values.
  console.error(
    "BLOB_SMOKE_FAILED",
    phase,
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});
