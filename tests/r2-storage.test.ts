import assert from "node:assert/strict";
import { test } from "node:test";
import { r2UploadPermission } from "../src/lib/r2-storage";
import { compareStorageInventory } from "../src/lib/r2-reconciliation";
import { r2Origin } from "../src/lib/r2-origin";
import { verifyStoredBytes } from "../src/lib/storage-integrity";
import {
  sharedStorageLimit,
  attachmentProvider,
  uploadStorageProvider,
} from "../src/lib/storage-config";

test("R2 signs exact upload metadata, forbids overwrite and caps expiry at the reservation lifetime", async () => {
  process.env.R2_ACCOUNT_ID = "a".repeat(32);
  process.env.R2_BUCKET = "fixture-only";
  process.env.R2_ACCESS_KEY_ID = "fixture-key";
  process.env.R2_SECRET_ACCESS_KEY = "fixture-secret";
  const item = {
    createdAt: new Date(),
    storagePath: "evolve-files/fixture/txt",
    contentType: "text/plain",
    size: 3,
  };
  const permission = await r2UploadPermission(item);
  const url = new URL(permission.url);
  assert.equal(url.origin, r2Origin(process.env.R2_ACCOUNT_ID));
  assert.equal(url.pathname, "/fixture-only/evolve-files/fixture/txt");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(
    url.searchParams.get("X-Amz-SignedHeaders"),
    "content-length;content-type;host;if-none-match",
  );
  assert.deepEqual(permission.headers, {
    "Content-Type": "text/plain",
    "If-None-Match": "*",
  });
  const ending = await r2UploadPermission({
    ...item,
    createdAt: new Date(Date.now() - 3570000),
  });
  assert.ok(
    Number(new URL(ending.url).searchParams.get("X-Amz-Expires")) <= 30,
  );
  await assert.rejects(
    r2UploadPermission({ ...item, createdAt: new Date(Date.now() - 3600000) }),
    { status: 410 },
  );
  assert.equal(r2Origin("example.com;"), undefined);
});

test("inventory blocks unknown objects, wrong sizes and missing ready objects", () => {
  const rows = [
    { key: "ready", size: 3, required: true },
    { key: "pending", size: 5, required: false },
    { key: "copy-in-progress", size: 7, required: false },
  ];
  assert.deepEqual(compareStorageInventory(new Map([["ready", 3]]), rows), {
    observedBytes: 3,
    mismatchCount: 0,
  });
  assert.deepEqual(
    compareStorageInventory(
      new Map([
        ["pending", 8],
        ["orphan", 9],
      ]),
      rows,
    ),
    {
      observedBytes: 17,
      mismatchCount: 3,
    },
  );
});

test("migration verification checks complete bytes instead of trusting provider metadata", async () => {
  const content = () => new Blob(["abc"]).stream();
  assert.equal(
    (await verifyStoredBytes(content(), 3)).sha256,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  await assert.rejects(verifyStoredBytes(content(), 2), /larger/);
  await assert.rejects(verifyStoredBytes(content(), 4), /shorter/);
});

test("pausing new writes preserves mixed provider routing and the expanded allowance", () => {
  process.env.EVOLVE_STORAGE_WRITE_MODE = "paused";
  process.env.EVOLVE_STORAGE_EXPANDED_QUOTA = "1";
  assert.equal(uploadStorageProvider(), null);
  assert.equal(sharedStorageLimit(), 9_000_000_000);
  assert.equal(attachmentProvider({ storageProvider: "blob" }), "blob");
  assert.equal(attachmentProvider({ storageProvider: "r2" }), "r2");
});
