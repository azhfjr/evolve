import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLockerCostReadOnly } from "../src/lib/project-cost-authority";
test("Locker accepts omitted/unchanged historical costs but rejects exact financial differences", () => {
  const before = {
    budget: "99999999999999.99",
    currency: "USD" as const,
    costItems: null,
    costOptions: null,
  };
  assert.doesNotThrow(() =>
    assertLockerCostReadOnly(before, { name: "Metadata edit" }),
  );
  assert.doesNotThrow(() =>
    assertLockerCostReadOnly(before, { budget: "099999999999999.9900" }),
  );
  assert.throws(
    () => assertLockerCostReadOnly(before, { budget: "99999999999999.98" }),
    { status: 410 },
  );
  assert.throws(() => assertLockerCostReadOnly(null, { budget: "1" }), {
    status: 410,
  });
  assert.doesNotThrow(() =>
    assertLockerCostReadOnly(null, {
      budget: 0,
      costOptions: [],
      costItems: [],
    }),
  );
});
