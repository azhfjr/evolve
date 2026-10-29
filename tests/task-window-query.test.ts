import { test } from "node:test";
import assert from "node:assert/strict";
import { querySchema } from "../src/lib/task-query";
import { savedFilterSchema } from "../src/lib/project-model";

test("calendar windows accept explicit overlap mode while legacy queries keep their fingerprint shape", () => {
  const legacy = querySchema.parse({ from: "2026-10-01", to: "2026-10-31" });
  assert.equal(Object.hasOwn(legacy, "dateMode"), false);
  const window = querySchema.parse({
    from: "2026-10-01",
    to: "2026-10-31",
    dateMode: "overlap",
  });
  assert.equal(window.dateMode, "overlap");
  assert.equal(querySchema.safeParse({ dateMode: "invalid" }).success, false);
});

test("saved schedule drilldowns retain their day and overlap semantics without changing legacy defaults", () => {
  const legacy = savedFilterSchema.parse({});
  assert.equal(Object.hasOwn(legacy, "from"), false);
  assert.equal(Object.hasOwn(legacy, "dateMode"), false);
  const view = savedFilterSchema.parse({
    from: "2026-10-21",
    to: "2026-10-21",
    dateMode: "overlap",
    open: true,
  });
  assert.equal(view.dateMode, "overlap");
  assert.equal(view.from, "2026-10-21");
  assert.equal(view.to, "2026-10-21");
});
