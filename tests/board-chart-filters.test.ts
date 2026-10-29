import { test } from "node:test";
import assert from "node:assert/strict";
import { chartQuery } from "../src/lib/board-room/chart-filters";
import { EMPTY_QUERY } from "../src/lib/board-room/model";
test("chart_query_preserves_context", () => {
  const result = chartQuery(
    { ...EMPTY_QUERY, search: "Solar", sort: "name", page: 9 },
    { category: "Pembangkit" },
  );
  assert.equal(result.search, "Solar");
  assert.equal(result.sort, "name");
  assert.equal(result.page, 1);
  assert.equal(result.category, "Pembangkit");
});
