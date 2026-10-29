import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountSchema,
  normalizeMoney,
  sumMoney,
  formatMoney,
  projectCostFields,
  projectFields,
  projectCostItemsSchema,
  costUnitTotals,
  formatCostAmount,
} from "../src/lib/project-model";
import { moneyInputValue, moneyInputDisplay } from "../src/lib/money-input";
import {
  parseProjectDraft,
  projectDraftFields,
} from "../src/lib/project-composer";

const option = (title: string, amount: string, unit = "USD") => ({
  id: crypto.randomUUID(),
  title,
  items: [{ id: crypto.randomUUID(), title: "Supply", unit, amount }],
});

test("amounts above twelve digits preserve exact money and rate arithmetic", () => {
  const whole = "123456789012345678901234567890";
  assert.equal(normalizeMoney(`${whole}.12`), `${whole}.12`);
  assert.equal(
    sumMoney([`${whole}.12`, "0.89"]),
    "123456789012345678901234567891.01",
  );
  assert.equal(moneyInputValue(`${whole}.123456`, 6), `${whole}.123456`);
  assert.equal(moneyInputValue(`${whole}.123456`, 2), null);
  assert.equal(
    moneyInputDisplay(`${whole}.12`),
    "123,456,789,012,345,678,901,234,567,890.12",
  );
  assert.equal(
    formatMoney(`${whole}.12`, "USD"),
    "$123,456,789,012,345,678,901,234,567,890.12",
  );
  assert.equal(
    formatMoney(`-${whole}.12`, "USD"),
    "-$123,456,789,012,345,678,901,234,567,890.12",
  );
  assert.equal(
    formatMoney(`${whole}.12`, "IDR"),
    "IDR 123,456,789,012,345,678,901,234,567,890.12",
  );
  const rates = projectFields.parse({
    name: "Rates",
    costOptions: [option("A", `${whole}.123456`, "Rp/kWh")],
  });
  assert.equal(
    formatCostAmount(
      costUnitTotals(rates.costOptions![0].items)[0].amount,
      "Rp/kWh",
    ),
    "123,456,789,012,345,678,901,234,567,890.123456 Rp/kWh",
  );
});

test("PostgreSQL representability bounds huge inputs while option totals stay exact", () => {
  const maximum = "9".repeat(131072);
  assert.equal(amountSchema.safeParse(`${maximum}.99`).success, true);
  assert.equal(amountSchema.safeParse(`${maximum}9.99`).success, false);
  assert.equal(moneyInputValue(`${maximum}.123456`, 6) !== null, true);
  assert.equal(moneyInputValue(`${maximum}9.123456`, 6), null);
  const parsed = projectFields.safeParse({
    name: "Boundary",
    costOptions: [option("A", `${maximum}.99`), option("B", `${maximum}.99`)],
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const item = parsed.data.costOptions![0].items[0];
  const total = costUnitTotals([
    item,
    { ...item, id: crypto.randomUUID(), amount: "0.01" },
  ])[0].amount;
  assert.equal(total === `1${"0".repeat(131072)}.00`, true);
  assert.equal(
    formatCostAmount(total, "USD").replaceAll(",", "") === `$${total}`,
    true,
  );
  assert.equal(
    projectCostItemsSchema.safeParse([
      {
        id: crypto.randomUUID(),
        title: "A",
        currency: "USD",
        amount: `${maximum}.99`,
      },
      { id: crypto.randomUUID(), title: "B", currency: "USD", amount: "0.01" },
    ]).success,
    false,
    "legacy numeric budget must fit PostgreSQL",
  );
});

test("grouped options keep their own amounts and never project a combined budget", () => {
  const fields = projectFields.parse({
    name: "Alternatives",
    currency: "USD",
    costOptions: [
      option("A", "999999999999999999999.10"),
      option("B", "200000000000000000000.20"),
    ],
  });
  const projected = projectCostFields(fields);
  assert.deepEqual(projected.costOptions, fields.costOptions);
  assert.deepEqual(projected.costItems, []);
  assert.equal(projected.budget, "0.00");
  assert.deepEqual(
    projected.costOptions!.map((o) => costUnitTotals(o.items)),
    [
      [{ unit: "USD", amount: "999999999999999999999.10" }],
      [{ unit: "USD", amount: "200000000000000000000.20" }],
    ],
  );
});

test("large drafts restore exact amounts and original request fingerprints", () => {
  const amount = `${"1".repeat(131072)}.123456`;
  const fields = projectDraftFields.safeParse({
    name: "Large draft",
    budget: "0.00",
    costOptions: [option("A", amount, "Rp/kWh")],
  });
  assert.equal(fields.success, true);
  if (!fields.success) return;
  const request = {
    id: crypto.randomUUID(),
    fingerprint: JSON.stringify(projectFields.parse(fields.data)),
  };
  const now = Date.now();
  const restored = parseProjectDraft(
    JSON.stringify({ savedAt: now, draft: { fields: fields.data, request } }),
    now,
  );
  assert.equal(
    restored?.fields.costOptions?.[0].items[0].amount === amount,
    true,
  );
  assert.equal(restored?.request.fingerprint === request.fingerprint, true);
});
