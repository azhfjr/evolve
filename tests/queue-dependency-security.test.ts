import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const queueRequire = createRequire(require.resolve("@vercel/queue"));
test("Queue resolves the scoped patched matcher and retains route-pattern compatibility", async () => {
  assert.equal(queueRequire("minimatch/package.json").version, "11.0.8");
  const { minimatch } = queueRequire("minimatch");
  for (const [file, pattern, expected] of [
    ["src/app/api/queues/calendar/route.ts", "src/app/api/queues/**", true],
    ["app/api/queues/calendar/route.ts", "app/api/queues/*/route.ts", true],
    ["app/api/private/route.ts", "app/api/queues/**", false],
    [
      "app/api/queues/calendar/route.ts",
      "app/api/queues/{calendar,files}/route.ts",
      true,
    ],
  ] as const)
    assert.equal(minimatch(file, pattern), expected);
  const { QueueClient } = await import("@vercel/queue");
  const queue = new QueueClient({ region: "sin1" });
  assert.equal(typeof queue.send, "function");
  assert.equal(
    typeof queue.handleCallback(async () => {}, {
      visibilityTimeoutSeconds: 90,
    }),
    "function",
  );
});
