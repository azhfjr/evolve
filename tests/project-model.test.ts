import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMoney,
  moneyMinor,
  moneyFromMinor,
  sumMoney,
  expenseFields,
  formatMoney,
} from "../src/lib/project-model";
test("financial amounts preserve decimal precision and reject ambiguous inputs", () => {
  assert.equal(sumMoney(["0.10", "0.20"]), "0.30");
  assert.equal(normalizeMoney("000123.4"), "123.40");
  assert.equal(
    moneyFromMinor(moneyMinor("999999999999.99")),
    "999999999999.99",
  );
  assert.equal(
    sumMoney(["999999999999.99", "999999999999.99"]),
    "1999999999999.98",
  );
  assert.equal(formatMoney("123.45", "USD"), "$123.45");
  for (const invalid of ["1,000", "1.001", "-1", "1e2", "Infinity", ""])
    assert.throws(() => normalizeMoney(invalid));
  const base = {
    projectId: crypto.randomUUID(),
    currency: "IDR",
    description: "Planning review",
    category: "engineering",
    bookedOn: "2026-12-01",
  };
  for (const amount of ["0", "-1", "0.001"])
    assert.equal(expenseFields.safeParse({ ...base, amount }).success, false);
});
