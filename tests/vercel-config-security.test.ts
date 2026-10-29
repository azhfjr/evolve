import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const configRequire = createRequire(require.resolve("@vercel/cli-config"));
test("Vercel config dependency rejects oversized constrained collections without per-item allocation", () => {
  const { z } = configRequire("zod");
  const result = z
    .array(z.object({ value: z.string() }))
    .max(1)
    .safeParse(Array.from({ length: 20000 }, () => ({ value: 123 })));
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, "too_big");
});
test("patched validator retains the actual Vercel CLI credential/config schema contract", () => {
  const { authConfigSchema, globalConfigSchema } = require(
    join(dirname(require.resolve("@vercel/cli-config")), "schema.zod.js"),
  );
  assert.equal(
    authConfigSchema.safeParse({
      token: "fixture-only",
      tokenSource: "env",
      expiresAt: 123,
    }).success,
    true,
  );
  assert.equal(authConfigSchema.safeParse({ token: 123 }).success, false);
  assert.equal(
    globalConfigSchema.safeParse({
      currentTeam: "fixture",
      telemetry: { enabled: false },
      credStorage: "file",
    }).success,
    true,
  );
});
