import { selectOption } from "./ui-helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

const origin = "http://127.0.0.1:3100";
for (const size of [256 * 1024, 11 * 1024 * 1024]) {
  test(`Blob SDK upload crosses the real CSP endpoint and persists ${size} bytes with private readback`, async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(60000);
    const auth = JSON.parse(await readFile(".data/e2e-auth.json", "utf8"));
    const session = (value: string) => ({
      name: "better-auth.session_token",
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    });
    await context.addCookies([session(auth["e2e-admin"])]);
    let reservation: { id: string; storagePath: string; contentType: string };
    const parts = new Map<number, Buffer>();
    const sentBodies = new Map<string, Buffer>();
    await page.exposeBinding(
      "__captureBlobBody",
      (_source, key: string, base64: string) => {
        sentBodies.set(key, Buffer.from(base64, "base64"));
      },
    );
    let transfers = 0,
      retryInjected = false,
      requestedMultipart = false;
    await page.route("**/api/attachments", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      reservation = await response.json();
      await route.fulfill({
        response,
        json: { ...reservation, provider: "blob" },
      });
    });
    await page.route("**/api/attachments/upload", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.type).toBe("blob.generate-client-token");
      expect(body.payload.pathname).toBe(reservation.storagePath);
      expect(JSON.parse(body.payload.clientPayload).id).toBe(reservation.id);
      requestedMultipart = body.payload.multipart;
      const clientToken = await generateClientTokenFromReadWriteToken({
        token:
          "vercel_blob_rw_e2estore_fake-key-for-intercepted-transport-only",
        pathname: reservation.storagePath,
        maximumSizeInBytes: size,
        allowedContentTypes: ["text/plain"],
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil: Date.now() + 60000,
      });
      await route.fulfill({ json: { type: body.type, clientToken } });
    });
    // The real browser SDK uses vercel.com/api/blob, not the blob download host.
    // Only that external transport is simulated; finalization/readback use the real app and disposable PostgreSQL/local files.
    await page.route("https://vercel.com/api/blob**", async (route) => {
      const request = route.request();
      const cors = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers":
          request.headers()["access-control-request-headers"] || "*",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors });
      expect(request.headers()["x-vercel-blob-access"]).toBe("private");
      expect(request.headers().authorization).toContain(
        "vercel_blob_client_e2estore_",
      );
      const action = request.headers()["x-mpu-action"];
      const pathname = new URL(request.url()).searchParams.get("pathname");
      expect(pathname).toBe(reservation.storagePath);
      if (action === "create")
        return route.fulfill({
          headers: cors,
          json: { key: pathname, uploadId: "fixture-upload" },
        });
      if (action === "upload") {
        transfers++;
        if (!retryInjected) {
          retryInjected = true;
          return route.fulfill({
            status: 503,
            headers: cors,
            json: {
              error: {
                code: "service_unavailable",
                message: "Retry this part",
              },
            },
          });
        }
        const partNumber = Number(request.headers()["x-mpu-part-number"]);
        await expect.poll(() => sentBodies.has(String(partNumber))).toBe(true);
        parts.set(partNumber, sentBodies.get(String(partNumber))!);
        return route.fulfill({
          headers: cors,
          json: { etag: `part-${partNumber}` },
        });
      }
      if (!action) await expect.poll(() => sentBodies.has("single")).toBe(true);
      const bytes =
        action === "complete"
          ? Buffer.concat(
              [...parts].sort(([a], [b]) => a - b).map(([, body]) => body),
            )
          : sentBodies.get("single")!;
      expect(bytes.length).toBe(size);
      const stored = await page.request.post(
        `/api/attachments/local-upload?id=${reservation.id}`,
        { headers: { origin, "Content-Type": "text/plain" }, data: bytes },
      );
      expect(stored.status()).toBe(200);
      const url = `https://e2estore.private.blob.vercel-storage.com/${pathname}`;
      await route.fulfill({
        headers: cors,
        json: {
          url,
          downloadUrl: url,
          pathname,
          contentType: "text/plain",
          contentDisposition: "attachment",
          etag: "fixture-etag",
        },
      });
    });
    await page.addInitScript(() => {
      // Chromium omits streamed File payloads from CDP postData. Observe a cloned
      // SDK request without altering its URL/body, then deliver those actual bytes
      // to the simulated transport. CSP and the SDK still execute normally.
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const request = new Request(input, init);
        const action = request.headers.get("x-mpu-action");
        if (
          request.url.startsWith("https://vercel.com/api/blob/") &&
          request.body &&
          (!action || action === "upload")
        ) {
          const key = request.headers.get("x-mpu-part-number") || "single";
          void request
            .clone()
            .arrayBuffer()
            .then((bytes) => {
              const reader = new FileReader();
              reader.onload = () => {
                void (
                  window as typeof window & {
                    __captureBlobBody: (
                      key: string,
                      bytes: string,
                    ) => Promise<void>;
                  }
                ).__captureBlobBody(key, String(reader.result).split(",")[1]);
              };
              reader.readAsDataURL(new Blob([bytes]));
            });
        }
        return nativeFetch(request);
      };
      (window as typeof window & { uploadCsp: string[] }).uploadCsp = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        if (e.effectiveDirective === "connect-src")
          (window as typeof window & { uploadCsp: string[] }).uploadCsp.push(
            e.blockedURI,
          );
      });
    });
    await page.goto("/app?section=tasks&task=new");
    await page
      .getByLabel("Task title", { exact: true })
      .fill(`Blob transport ${size}`);
    const files = page.getByRole("region", {
      name: "Task draft attachments",
      exact: true,
    });
    const content = Buffer.alloc(size, 65);
    await selectOption(files.getByLabel("Draft document purpose"), "Reference");
    await files.locator("input[type=file]").setInputFiles({
      name: "Blob transport.txt",
      mimeType: "text/plain",
      buffer: content,
    });
    await expect(
      files.getByRole("link", { name: "Blob transport.txt", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    expect(requestedMultipart).toBe(size > 5 * 1024 * 1024);
    if (requestedMultipart) {
      expect(retryInjected).toBe(true);
      expect(parts.size).toBeGreaterThan(1);
      expect(transfers).toBe(parts.size + 1);
    }
    const id = reservation!.id;
    const member = await browser.newContext();
    await member.addCookies([session(auth["e2e-member"])]);
    expect(
      (
        await member.request.get(`${origin}/api/attachments/${id}/content`)
      ).status(),
    ).toBe(404);
    const saved = await page.request.get(`/api/attachments/${id}/content`);
    expect(saved.status()).toBe(200);
    expect(await saved.body()).toEqual(content);
    expect(
      await page.evaluate(
        () => (window as typeof window & { uploadCsp: string[] }).uploadCsp,
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(files).toHaveCount(0);
    expect(
      (
        await member.request.get(`${origin}/api/attachments/${id}/content`)
      ).status(),
    ).toBe(200);
    await member.close();
    await page.reload();
    expect(
      (await page.request.get(`/api/attachments/${id}/content`)).status(),
    ).toBe(200);
    // Allowing Blob's API must not allow unrelated endpoints on vercel.com.
    await page.evaluate(async () => {
      try {
        await fetch("https://vercel.com/api/unrelated-upload-test");
      } catch {}
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { uploadCsp?: string[] }).uploadCsp ||
            [],
        ),
      )
      .toContain("https://vercel.com/api/unrelated-upload-test");
  });
}
