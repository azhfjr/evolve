import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatWorkspaceStorage,
  R2_FILE_LIMIT,
  WORKSPACE_FILE_LIMIT,
} from "../src/lib/file-management-model";
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

test("storage UI uses the existing allowance in Blob mode and exact decimal capacity in R2 mode", () => {
  assert.equal(
    formatWorkspaceStorage(WORKSPACE_FILE_LIMIT, WORKSPACE_FILE_LIMIT),
    "1 GB",
  );
  assert.equal(formatWorkspaceStorage(R2_FILE_LIMIT, R2_FILE_LIMIT), "9 GB");
  assert.equal(
    formatWorkspaceStorage(R2_FILE_LIMIT - 8_000_000_000, R2_FILE_LIMIT),
    "1 GB",
  );
  assert.equal(storageGuidance(7_200_000_000, R2_FILE_LIMIT).level, "warning");
  assert.equal(storageGuidance(8_550_000_000, R2_FILE_LIMIT).level, "critical");
});
