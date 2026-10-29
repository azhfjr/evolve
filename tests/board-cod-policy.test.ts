import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPlannedCodAssignment,
  PLANNED_COD_YEARS,
} from "../src/lib/board-room/cod-policy";
test("new or changed COD assignments are constrained while unchanged historical years survive", () => {
  assert.deepEqual(
    PLANNED_COD_YEARS,
    Array.from({ length: 15 }, (_, i) => 2026 + i),
  );
  for (const year of [null, 2026, 2032, 2040])
    assert.doesNotThrow(() => assertPlannedCodAssignment(year));
  for (const year of [2025, 2041, 2026.5])
    assert.throws(() => assertPlannedCodAssignment(year), /2026.*2040/);
  assert.doesNotThrow(() => assertPlannedCodAssignment(2024, 2024));
  assert.throws(() => assertPlannedCodAssignment(2024, 2030), /2026.*2040/);
  assert.doesNotThrow(() => assertPlannedCodAssignment(null, 2024));
});
