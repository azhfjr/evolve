import { test } from "node:test";
import assert from "node:assert/strict";
import { projectFields, projectCostOptions } from "../src/lib/project-model";
import { projectSubmissionFields } from "../src/lib/project-composer";
import { commandSchema } from "../src/lib/validation";
import { demoCommand } from "../src/lib/client-store";
import { createDemo } from "../src/lib/demo";
import type { Project } from "../src/lib/types";

test("planned COD accepts only optional nullable integer years 2026 through 2040", () => {
  for (const plannedCodYear of [2026, 2033, 2040, null, undefined]) {
    const parsed = projectFields.parse({ name: "Plant", plannedCodYear });
    assert.equal(parsed.plannedCodYear, plannedCodYear);
    assert.equal(
      commandSchema.safeParse({
        action: "createProject",
        name: "Plant",
        plannedCodYear,
      }).success,
      true,
    );
  }
  assert.equal(
    "plannedCodYear" in projectFields.parse({ name: "Legacy" }),
    false,
  );
  for (const plannedCodYear of [2025, 2041, 2026.5, "2026", "", true, {}, []]) {
    assert.equal(
      projectFields.safeParse({ name: "Plant", plannedCodYear }).success,
      false,
    );
    assert.equal(
      commandSchema.safeParse({
        action: "createProject",
        name: "Plant",
        plannedCodYear,
      }).success,
      false,
    );
  }
});

test("unchanged pre-COD draft fingerprints survive a seeded null for legacy and grouped costs", () => {
  for (const costOptions of [undefined, []]) {
    const original = projectFields.parse({
      name: "Committed plant",
      costOptions,
    });
    const fingerprint = JSON.stringify(original);
    const hydrated = {
      ...original,
      plannedCodYear: null,
      costOptions: costOptions ?? projectCostOptions(original),
    };
    const replay = projectSubmissionFields(hydrated, fingerprint);
    assert.equal(replay.success, true);
    if (replay.success) assert.equal(JSON.stringify(replay.data), fingerprint);
    const changed = projectSubmissionFields(
      { ...hydrated, plannedCodYear: 2026 },
      fingerprint,
    );
    assert.equal(changed.success, true);
    if (changed.success) {
      assert.equal(changed.data.plannedCodYear, 2026);
      assert.notEqual(JSON.stringify(changed.data), fingerprint);
    }
  }
});

test("unchanged grouped legacy receipts preserve compatibility rows and exact request identity", () => {
  const item = {
    id: crypto.randomUUID(),
    title: "Equipment",
    amount: "125.50",
  };
  const original = projectFields.parse({
    name: "Committed grouped plant",
    currency: "USD",
    budget: "125.50",
    costItems: [{ ...item, currency: "USD" }],
    costOptions: [
      {
        id: crypto.randomUUID(),
        title: "Capital",
        items: [{ ...item, unit: "USD" }],
      },
    ],
  });
  const fingerprint = JSON.stringify(original);
  const hydrated = { ...original, plannedCodYear: null };
  const replay = projectSubmissionFields(hydrated, fingerprint);
  assert.equal(replay.success, true);
  if (replay.success) {
    assert.equal(JSON.stringify(replay.data), fingerprint);
    assert.deepEqual(replay.data.costItems, original.costItems);
    assert.equal("plannedCodYear" in replay.data, false);
  }
  const changed = projectSubmissionFields(
    {
      ...hydrated,
      costOptions: original.costOptions!.map((option) => ({
        ...option,
        items: option.items.map((cost) => ({ ...cost, amount: "126.50" })),
      })),
    },
    fingerprint,
  );
  assert.equal(changed.success, true);
  if (changed.success) {
    assert.notEqual(JSON.stringify(changed.data), fingerprint);
    assert.equal(changed.data.costOptions?.[0].items[0].amount, "126.50");
    assert.equal(changed.data.costItems, undefined);
  }
});

test("demo project COD creates, updates, clears and preserves omission and label-only edits", () => {
  let data = createDemo();
  data.actor.isAdmin = true;
  const apply = (input: unknown) => {
    const result = demoCommand(data, commandSchema.parse(input), false);
    data = result.data;
    return result.result.project as Project;
  };
  const p = apply({
    action: "createProject",
    name: "COD demo",
    plannedCodYear: 2026,
  });
  assert.equal(p.plannedCodYear, 2026);
  const fields = projectFields.parse({ name: p.name });
  const update = (version: number, extra = {}) => ({
    ...fields,
    action: "updateProject",
    id: p.id,
    version,
    ...extra,
  });
  const kept = apply(update(1));
  assert.equal(kept.plannedCodYear, 2026);
  const labels = apply({
    action: "updateConnectionLabels",
    kind: "project",
    id: p.id,
    version: 2,
    labels: ["COD"],
  });
  assert.equal(labels.plannedCodYear, 2026);
  assert.throws(() => apply(update(2, { plannedCodYear: 2040 })), /changed/i);
  const changed = apply(update(3, { plannedCodYear: 2040 }));
  assert.equal(changed.plannedCodYear, 2040);
  data.actor.isAdmin = false;
  assert.throws(
    () => apply(update(4, { plannedCodYear: null })),
    /administrator/i,
  );
  assert.throws(
    () =>
      apply({
        action: "createProject",
        name: "Unauthorized",
        plannedCodYear: 2026,
      }),
    /administrator/i,
  );
  data.actor.isAdmin = true;
  assert.equal(apply(update(4, { plannedCodYear: null })).plannedCodYear, null);
  assert.equal(
    apply({ action: "createProject", name: "Legacy demo" }).plannedCodYear,
    undefined,
  );
});
