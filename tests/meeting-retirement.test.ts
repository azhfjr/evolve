import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DOCUMENT_PURPOSES } from "../src/lib/document-model";
test("retired meeting routes cannot be compiled into the application", () => {
  assert.equal(existsSync("src/app/api/board-room/meetings/route.ts"), false);
  assert.equal(existsSync("src/app/workspace/meetings/[id]/page.tsx"), false);
  assert.ok(DOCUMENT_PURPOSES.includes("Meeting Notes"));
});
