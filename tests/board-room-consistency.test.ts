import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMapping,
  parseProjectCSV,
  exportProjectCSV,
} from "../src/lib/board-room/csv";
test("RUPTL Code is the canonical import/export identity while old Project ID files still map", () => {
  assert.equal(
    defaultMapping(["RUPTL Code", "Project name"]).externalId,
    "RUPTL Code",
  );
  assert.equal(
    defaultMapping(["Project ID", "Project name"]).externalId,
    "Project ID",
  );
  assert.equal(
    defaultMapping(["Project ID", "RUPTL Code"]).externalId,
    "RUPTL Code",
  );
  assert.equal(
    parseProjectCSV("RUPTL Code,Project name\nRUPTL-01,Test")[0].patch
      .externalId,
    "RUPTL-01",
  );
  assert.equal(
    parseProjectCSV("Project ID,Project name\nOLD-01,Legacy")[0].patch
      .externalId,
    "OLD-01",
  );
  assert.match(exportProjectCSV([]).split("\r\n")[0], /^"RUPTL Code"/);
});
