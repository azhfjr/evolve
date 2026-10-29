import { test } from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/lib/project-model";
import { projectDraftFields } from "../src/lib/project-composer";
const group = "10000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const options = [
  {
    id: group,
    title: "Equipment",
    items: [
      { id: id(1), title: "Domestic", unit: "IDR" as const, amount: "0.10" },
      { id: id(2), title: "Imported", unit: "USD" as const, amount: "20" },
      {
        id: id(3),
        title: "Rate",
        unit: "cUSD/kWh" as const,
        amount: "0.123456",
      },
      {
        id: id(4),
        title: "Rate 2",
        unit: "cUSD/kWh" as const,
        amount: "0.000001",
      },
    ],
  },
];
test("options total their own units and keep compatibility budgets empty", () => {
  const parsed = model.projectFields.parse({
    name: "Plant",
    category: "Pembangkit",
    costOptions: options,
  });
  const fields = model.projectCostFields(parsed);
  assert.equal(fields.category, "Pembangkit");
  assert.equal(fields.budget, "0.00");
  assert.deepEqual(
    fields.costItems?.map((x) => [x.currency, x.amount]),
    [],
  );
  assert.deepEqual(model.costUnitTotals(fields.costOptions![0].items), [
    { unit: "IDR", amount: "0.10" },
    { unit: "USD", amount: "20.00" },
    { unit: "cUSD/kWh", amount: "0.123457" },
  ]);
  assert.equal(
    model.formatCostAmount("999999999999.123456", "Rp/kWh"),
    "999,999,999,999.123456 Rp/kWh",
  );
});
test("legacy conversion is stable and read only; explicit empty groups stay empty", () => {
  const legacy = { id: group, currency: "USD" as const, budget: "15.00" };
  assert.deepEqual(
    model.projectCostOptions(legacy),
    model.projectCostOptions(legacy),
  );
  assert.equal(model.projectCostOptions(legacy)[0].title, "General costs");
  assert.equal(model.projectCostOptions(legacy)[0].items[0].unit, "USD");
  assert.deepEqual(
    model.projectCostOptions({ ...legacy, costOptions: [] }),
    [],
  );
  assert.equal("costOptions" in legacy, false);
});
test("schema rejects duplicate IDs, duplicate titles, overprecision and malformed groups", () => {
  for (const costOptions of [
    [...options, { ...options[0], id: id(8), title: "equipment", items: [] }],
    [{ ...options[0], items: [options[0].items[0], options[0].items[0]] }],
    [{ ...options[0], items: [{ ...options[0].items[0], amount: "1.001" }] }],
    [
      {
        ...options[0],
        items: [{ ...options[0].items[2], amount: "1.1234567" }],
      },
    ],
    [{ ...options[0], items: [{ ...options[0].items[2], amount: "-1" }] }],
    [{ ...options[0], items: [{ ...options[0].items[2], unit: "EUR" }] }],
    Array.from({ length: 11 }, (_, n) => ({
      id: id(n),
      title: `Group ${n}`,
      items: [],
    })),
    [
      {
        ...options[0],
        items: Array.from({ length: 51 }, (_, n) => ({
          ...options[0].items[0],
          id: id(n),
        })),
      },
    ],
  ])
    assert.equal(
      model.projectFields.safeParse({ name: "Plant", costOptions }).success,
      false,
    );
  assert.equal(
    model.projectFields.safeParse({ name: "Plant", category: "Substation" })
      .success,
    false,
  );
});
test("omitted optional fields remain absent and drafts keep blank option input", () => {
  const parsed = model.projectFields.parse({ name: "Plant" });
  assert.equal(parsed.category, undefined);
  assert.equal(parsed.costOptions, undefined);
  const draft = projectDraftFields.parse({
    name: "",
    budget: "",
    costOptions: [
      {
        id: group,
        title: "",
        items: [{ id: id(1), title: "", unit: "Rp/kWh", amount: "" }],
      },
    ],
  });
  assert.equal(draft.costOptions?.[0].items[0].amount, "");
  assert.equal(model.projectFields.safeParse(draft).success, false);
});

test("maximum precision stays exact when option totals carry into another digit", () => {
  const maximum = model.projectCostOptionsSchema.parse([
    {
      id: group,
      title: "Rates",
      items: [
        {
          id: id(1),
          title: "Rate",
          unit: "Rp/kWh",
          amount: "999999999999.999999",
        },
      ],
    },
  ]);
  assert.equal(
    model.costUnitTotals(maximum[0].items)[0].amount,
    "999999999999.999999",
  );
  assert.equal(
    model.formatCostAmount(
      model.costUnitTotals(maximum[0].items)[0].amount,
      "Rp/kWh",
    ),
    "999,999,999,999.999999 Rp/kWh",
  );
  assert.deepEqual(
    model.costUnitTotals([
      ...maximum[0].items,
      { id: id(2), title: "Carry", unit: "Rp/kWh", amount: "0.000001" },
    ]),
    [{ unit: "Rp/kWh", amount: "1000000000000" }],
  );
  assert.equal(
    model.projectCostOptionsSchema.safeParse([
      ...maximum,
      {
        id: id(9),
        title: "Other",
        items: [
          { id: id(2), title: "Overflow", unit: "Rp/kWh", amount: "0.000001" },
        ],
      },
    ]).success,
    true,
  );
  assert.equal(
    model.projectCostOptionsSchema.safeParse([
      { id: group, title: "One", items: [] },
      { id: group, title: "Two", items: [] },
    ]).success,
    false,
  );
  const many = Array.from({ length: 26 }, (_, n) => ({
    id: id(n),
    title: "Item",
    unit: "USD",
    amount: "0",
  }));
  assert.equal(
    model.projectCostOptionsSchema.safeParse([
      { id: group, title: "One", items: many },
      {
        id: id(100),
        title: "Two",
        items: many.map((item, n) => ({ ...item, id: id(200 + n) })),
      },
    ]).success,
    false,
  );
});

test("demo commands preserve grouped costs and category for older metadata and label edits", async () => {
  const { createDemo } = await import("../src/lib/demo");
  const { demoCommand } = await import("../src/lib/client-store");
  const { commandSchema } = await import("../src/lib/validation");
  let data = createDemo();
  data.actor.isAdmin = true;
  const created = demoCommand(
    data,
    commandSchema.parse({
      action: "createProject",
      name: "Grouped demo",
      category: "Gardu Induk",
      currency: "USD",
      costOptions: options,
    }),
    false,
  );
  data = created.data;
  const p = created.result.project as import("../src/lib/types").Project;
  const {
    costOptions: _options,
    category: _category,
    ...fields
  } = model.projectFields.parse(p);
  void _options;
  void _category;
  const update = demoCommand(
    data,
    commandSchema.parse({
      ...fields,
      action: "updateProject",
      id: p.id,
      version: 1,
      name: "Metadata",
    }),
    false,
  );
  const saved = update.result.project as import("../src/lib/types").Project;
  assert.deepEqual(saved.costOptions, p.costOptions);
  assert.equal(saved.category, "Gardu Induk");
  assert.throws(
    () =>
      demoCommand(
        update.data,
        commandSchema.parse({
          ...fields,
          action: "updateProject",
          id: p.id,
          version: 2,
          costItems: [
            {
              id: id(50),
              title: "Legacy mutation",
              currency: "USD",
              amount: "1.00",
            },
          ],
        }),
        false,
      ),
    /costs changed/i,
  );
  const { costItems: _items, ...omitted } = fields;
  void _items;
  const kept = demoCommand(
    update.data,
    commandSchema.parse({
      ...omitted,
      action: "updateProject",
      id: p.id,
      version: 2,
    }),
    false,
  );
  assert.deepEqual((kept.result.project as typeof p).costItems, p.costItems);
  assert.equal((kept.result.project as typeof p).category, "Gardu Induk");
  const labels = demoCommand(
    kept.data,
    commandSchema.parse({
      action: "updateConnectionLabels",
      kind: "project",
      id: p.id,
      version: 3,
      labels: ["Demo"],
    }),
    false,
  );
  assert.deepEqual(
    (labels.result.project as typeof p).costOptions,
    p.costOptions,
  );
  assert.equal((labels.result.project as typeof p).category, "Gardu Induk");
  const cleared = demoCommand(
    labels.data,
    commandSchema.parse({
      ...omitted,
      action: "updateProject",
      id: p.id,
      version: 4,
      category: null,
      costOptions: [],
    }),
    false,
  );
  assert.equal((cleared.result.project as typeof p).category, null);
  assert.deepEqual((cleared.result.project as typeof p).costOptions, []);
  assert.deepEqual((cleared.result.project as typeof p).costItems, []);
  assert.equal((cleared.result.project as typeof p).budget, "0.00");
});
