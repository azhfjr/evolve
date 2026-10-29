import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedRequest } from "../src/components/connected/data";

test("connected gateway errors are actionable and never expose parser output", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>Service unavailable</html>", { status: 503 }),
  );
  await assert.rejects(
    connectedRequest("/api/test", { action: "save" }),
    /temporarily unavailable.*not.*confirmed/i,
  );
});
test("connected errors preserve server conflict messages and handle empty status responses", async (t) => {
  for (const status of [401, 403, 409, 413, 503]) {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(null, { status }),
    );
    await assert.rejects(
      connectedRequest("/api/test"),
      (e: Error) => !/JSON|Unexpected/.test(e.message) && e.message.length > 15,
    );
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Record changed; review your input." },
      { status: 409 },
    ),
  );
  await assert.rejects(
    connectedRequest("/api/test"),
    /Record changed; review your input/,
  );
});
test("connected network failure is not retried and abort remains an abort", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    connectedRequest("/api/test", { action: "save" }),
    /connection.*not.*confirmed/i,
  );
  assert.equal(count, 1);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("Aborted", "AbortError");
  });
  await assert.rejects(connectedRequest("/api/test"), { name: "AbortError" });
});
test("connected JSON success and encoded import limits retain their contract", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json({ ok: true });
  });
  assert.deepEqual(await connectedRequest("/api/test"), { ok: true });
  await assert.rejects(
    connectedRequest("/api/test", { text: "é".repeat(2100000) }),
    /4 MiB/,
  );
  assert.equal(count, 1);
});
