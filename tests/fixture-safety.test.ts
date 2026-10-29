import { test } from "node:test";
import assert from "node:assert/strict";
import * as scale from "../scripts/scale-environment";
import config from "../playwright.config";
test("scale preparation rejects connection-string target overrides before any connection", () => {
  const original = process.env.DATABASE_URL,
    vercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    for (const suffix of [
      "?host=remote.example.test",
      "?hostaddr=192.0.2.1",
      "?port=5432",
      "?database=other",
      "?dbname=other",
      "?options=anything",
      "#other",
    ]) {
      process.env.DATABASE_URL =
        "postgresql://fixture:fixture@localhost/evolve" + suffix;
      assert.throws(
        () => scale.scaleDatabaseURL(),
        /localhost|query|override|plain|fragment/i,
      );
    }
    process.env.DATABASE_URL = "https://localhost/evolve";
    assert.throws(
      () => scale.scaleDatabaseURL(),
      /PostgreSQL|postgres|protocol/i,
    );
    process.env.DATABASE_URL =
      "postgresql://fixture:fixture@127.0.0.1:54329/evolve";
    assert.equal(scale.scaleDatabaseURL().pathname, "/evolve_perf");
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  }
});
test("ordinary and cross-browser test servers explicitly exclude Blob credentials", () => {
  const server = config.webServer as { env: Record<string, string> };
  assert.equal(server.env.BLOB_READ_WRITE_TOKEN, "");
});
test("scale test server excludes inherited Blob credentials", () => {
  assert.ok(
    "scaleServerEnvironment" in scale,
    "Scale server must construct a guarded test environment",
  );
  const initial = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN =
    "test-parent-token-that-must-not-be-inherited";
  try {
    const env = (
      scale as unknown as { scaleServerEnvironment: () => NodeJS.ProcessEnv }
    ).scaleServerEnvironment();
    assert.equal(env.BLOB_READ_WRITE_TOKEN, "");
    assert.equal(env.EVOLVE_LOCAL_FILES, "1");
    assert.ok(env.DATABASE_URL?.includes("/evolve_perf"));
  } finally {
    if (initial === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = initial;
  }
});
