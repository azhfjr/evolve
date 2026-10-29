import { test } from "node:test";
import assert from "node:assert/strict";
import { querySchema } from "../src/lib/task-query";
import { savedFilterSchema } from "../src/lib/project-model";

test("Overview task queries accept explicit open, today and future scopes", () => {
  for (const dueBucket of ["today", "future"] as const) {
    const result = querySchema.parse({
      open: "true",
      dueBucket,
      priority: "urgent",
    });
    assert.equal(result.open, "true");
    assert.equal(result.dueBucket, dueBucket);
    assert.equal(result.priority, "urgent");
  }
  assert.throws(() => querySchema.parse({ open: "yes" }));
  assert.throws(() => querySchema.parse({ dueBucket: "yesterday" }));
});

test("saved views preserve Overview scope while legacy views keep their meaning", () => {
  const current = savedFilterSchema.parse({ open: true, dueBucket: "today" });
  assert.equal(current.open, true);
  assert.equal(current.dueBucket, "today");
  const legacy = savedFilterSchema.parse({ dueBucket: "upcoming" });
  assert.equal(legacy.open, false);
  assert.equal(legacy.dueBucket, "upcoming");
});
