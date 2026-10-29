import { test } from "node:test";
import assert from "node:assert/strict";
import { storageGuidance } from "../src/lib/storage-guidance";
test("storage guidance uses shared physical quota with exact 80/95/100 boundaries", () => {
  assert.equal(storageGuidance(79, 100).level, "normal");
  assert.equal(storageGuidance(80, 100).level, "warning");
  assert.equal(storageGuidance(94, 100).level, "warning");
  assert.equal(storageGuidance(95, 100).level, "critical");
  assert.equal(storageGuidance(100, 100).level, "full");
  assert.equal(storageGuidance(130, 100).remaining, 0);
  assert.equal(storageGuidance(0, 100).remaining, 100);
});
test("invalid quota readings do not invent free storage", () => {
  assert.equal(storageGuidance(0, 0).level, "unknown");
  assert.equal(storageGuidance(-1, 100).level, "unknown");
  assert.equal(storageGuidance(NaN, 100).level, "unknown");
});
