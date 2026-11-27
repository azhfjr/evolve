import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { chromium, firefox } from "@playwright/test";
import {
  r2Delete,
  r2Head,
  r2Missing,
  r2Read,
  r2UploadPermission,
} from "../src/lib/r2-storage";
import { verifyStoredBytes } from "../src/lib/storage-integrity";

async function main() {
  if (!/^evolve-r2-test(?:-[a-z0-9-]+)?$/.test(process.env.R2_BUCKET ?? ""))
    throw new Error(
      "Run the browser contract probe only on a dedicated evolve-r2-test bucket.",
    );
  const key = "evolve-probe/" + randomUUID();
  const browserType = process.argv[2] === "firefox" ? firefox : chromium;
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    response.end("<!doctype html><title>Evolve R2 contract probe</title>");
  });
  const port = 3197;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  try {
    const browser = await browserType.launch({
      ...(browserType === chromium && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}`);
      const size = 25 * 1024 * 1024;
      const permission = await r2UploadPermission({
        storagePath: key,
        size,
        contentType: "text/plain",
        createdAt: new Date(),
      });
      const put = (length: number, changedType?: string) =>
        page.evaluate(
          ({ permission, length, changedType }) => {
            return new Promise<number>((resolve, reject) => {
              const request = new XMLHttpRequest();
              request.open("PUT", permission.url);
              request.timeout = 90000;
              request.setRequestHeader("If-None-Match", "*");
              request.setRequestHeader(
                "Content-Type",
                changedType || permission.headers["Content-Type"],
              );
              request.onload = () => resolve(request.status);
              request.onerror = request.ontimeout = () =>
                reject(new Error("R2 request or CORS check failed."));
              request.send(new Blob([new Uint8Array(length)]));
            });
          },
          { permission, length, changedType },
        );
      assert.equal(
        await put(size - 1),
        403,
        "signed size must reject a different body length",
      );
      assert.equal(
        await put(size, "application/octet-stream"),
        403,
        "signed MIME must reject a different MIME",
      );
      assert.equal(
        await put(size),
        200,
        "browser must upload the reserved 25 MiB",
      );
      assert.equal(
        await put(size),
        412,
        "immutable upload must reject overwrite",
      );
      const unsigned = new URL(permission.url);
      unsigned.search = "";
      const anonymous = await fetch(unsigned, { redirect: "manual" });
      await anonymous.body?.cancel();
      assert.ok(
        anonymous.status === 401 ||
          anonymous.status === 403 ||
          anonymous.status === 404,
      );
      const verified = await verifyStoredBytes(await r2Read(key), size);
      assert.equal(
        verified.sha256,
        createHash("sha256").update(Buffer.alloc(size)).digest("hex"),
      );
      await r2Delete(key);
      await assert.rejects(() => r2Head(key), r2Missing);
      console.log(
        JSON.stringify({
          browser: browserType.name(),
          bytes: size,
          providerContract: "passed",
        }),
      );
    } finally {
      await browser.close();
    }
  } finally {
    try {
      await r2Delete(key);
    } finally {
      server.close();
    }
  }
}

main().catch((error) => {
  // Never include presigned URLs or request dumps in probe output.
  console.error(error instanceof Error ? error.name : "R2ProbeFailed");
  process.exitCode = 1;
});
