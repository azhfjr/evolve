import { test } from "node:test";
import assert from "node:assert/strict";
import { preserveBoardContext } from "../src/lib/board-room/navigation-context";
test("refresh preserves graph and asset chart scope", () => {
  const current = new URLSearchParams({
    networkFilters: '{"year":"2028"}',
    networkPage: "3",
    assetUnit: "MW",
    assetProject: "11111111-1111-4111-8111-111111111111",
    assetCategory: "Pembangkit",
    projectScope: '{"year":"2028"}',
  });
  const next = preserveBoardContext(
    new URLSearchParams({ section: "assets" }),
    current,
  );
  for (const [key, value] of current) assert.equal(next.get(key), value);
});
