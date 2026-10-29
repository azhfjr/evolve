import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moneyInputValue,
  moneyInputEditValue,
  moneyInputDisplay,
  finishMoneyInput,
} from "../src/lib/money-input";
test("rate input preserves six decimals and grouping without relaxing monetary input", () => {
  assert.equal(moneyInputValue("1,350.125678", 6), "1350.125678");
  assert.equal(moneyInputValue("1,350.125678"), null);
  assert.equal(moneyInputValue("5.1234567", 6), null);
  assert.equal(moneyInputValue("-1", 6), null);
  assert.equal(moneyInputValue("1000000000000", 6), "1000000000000");
  assert.equal(moneyInputDisplay("1350.125678"), "1,350.125678");
  assert.equal(finishMoneyInput(".123456"), "0.123456");
});

test("a rate switched to money can be corrected one decimal at a time without rounding", () => {
  let value = "1350.123456";
  for (const expected of ["1350.12345", "1350.1234", "1350.123", "1350.12"]) {
    const next = moneyInputEditValue(moneyInputDisplay(expected), value, 2);
    assert.equal(next, expected);
    value = next!;
    assert.equal(
      moneyInputValue(value, 2),
      value.split(".")[1].length > 2 ? null : value,
    );
  }
  assert.equal(moneyInputEditValue("1350.1", value, 2), "1350.1");
  assert.equal(moneyInputEditValue("1350.123", value, 2), null);
});

test("precision correction does not admit new excess digits or malformed amounts", () => {
  const rate = "1350.123456";
  for (const attempted of [
    "1350.1234567",
    "1350.999999",
    "-1350.12345",
    "1350.12.345",
  ]) {
    assert.equal(moneyInputEditValue(attempted, rate, 2), null);
  }
  assert.equal(moneyInputEditValue("1350.123", "1350.12", 2), null);
  assert.equal(moneyInputEditValue("1350.1234567", rate, 6), null);
  assert.equal(moneyInputEditValue("1350.123456", "1350.12345", 6), rate);
});
