import { test } from "node:test";
import assert from "node:assert/strict";
import { boardRequest, boardGet } from "../src/components/board-room/api";
test("plain-text platform errors become useful import guidance", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("FUNCTION_PAYLOAD_TOO_LARGE", { status: 413 }),
  );
  await assert.rejects(
    boardRequest({ action: "importPreview" }),
    /Split.*4 MiB/,
  );
});
test("non-JSON gateway errors do not expose parser exceptions", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>gateway</html>", { status: 502 }),
  );
  await assert.rejects(
    boardGet(new URLSearchParams()),
    /temporarily unavailable.*retry/i,
  );
});
test("import budget measures encoded UTF-8 JSON and rejects before fetch", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({});
  });
  await assert.rejects(
    boardRequest({ action: "importPreview", source: "é".repeat(2100000) }),
    /4 MiB/,
  );
  assert.equal(calls, 0);
});
test("ordinary JSON API errors retain their actionable server message", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Refresh this project and retry." },
      { status: 409 },
    ),
  );
  await assert.rejects(
    boardRequest({ action: "progress" }),
    /Refresh this project and retry/,
  );
});
