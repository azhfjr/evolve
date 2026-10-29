import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costTotals,
  projectCostItemsSchema,
  projectCosts,
  projectCostFields,
} from "../src/lib/project-model";
import {
  parseProjectDraft,
  projectDraftFields,
} from "../src/lib/project-composer";
import {
  initialTaskDraft,
  parseTaskDraft,
  taskInputFromDraft,
} from "../src/lib/task-composer";
test("named cost items sum exact cents within each currency and keep a safe compatibility amount", () => {
  const items = projectCostItemsSchema.parse([
    { id: crypto.randomUUID(), title: "Study", currency: "USD", amount: "0.1" },
    {
      id: crypto.randomUUID(),
      title: "Design",
      currency: "USD",
      amount: "0.2",
    },
    {
      id: crypto.randomUUID(),
      title: "Equipment",
      currency: "IDR",
      amount: "1250000.50",
    },
  ]);
  assert.deepEqual(costTotals(items), [
    { currency: "IDR", amount: "1250000.50" },
    { currency: "USD", amount: "0.30" },
  ]);
  assert.equal(
    projectCostFields({ currency: "USD", budget: "999.00", costItems: items })
      .budget,
    "0.30",
  );
  assert.deepEqual(projectCosts({ currency: "USD", budget: "123.45" })[0], {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Project cost",
    currency: "USD",
    amount: "123.45",
  });
  assert.deepEqual(
    projectCosts({ currency: "USD", budget: "123.45", costItems: [] }),
    [],
  );
  for (const invalid of [
    [{ ...items[0], title: " " }],
    [items[0], items[0]],
    [{ ...items[0], amount: "-1" }],
    [{ ...items[0], amount: "0.001" }],
  ])
    assert.equal(projectCostItemsSchema.safeParse(invalid).success, false);
});
test("project drafts retain unfinished cost rows without accepting them as final commands", () => {
  const fields = projectDraftFields.parse({
    name: "Draft",
    budget: "",
    costItems: [
      { id: crypto.randomUUID(), title: "", currency: "USD", amount: "" },
    ],
  });
  const now = Date.now(),
    saved = { fields, request: { id: crypto.randomUUID(), fingerprint: "" } };
  assert.deepEqual(
    parseProjectDraft(JSON.stringify({ savedAt: now, draft: saved }), now),
    saved,
  );
  assert.equal(
    projectCostItemsSchema.safeParse(fields.costItems).success,
    false,
  );
});
test("task drafts retain private upload references and exclude them from task field updates", () => {
  const draft = initialTaskDraft(null, {});
  draft.title = "File review";
  draft.attachments = [
    {
      id: crypto.randomUUID(),
      filename: "Study.pdf",
      size: 80,
      contentType: "application/pdf",
      ownerEmail: "owner@example.com",
      createdAt: new Date().toISOString(),
    },
  ];
  const restored = parseTaskDraft(
    JSON.stringify({ savedAt: Date.now(), draft }),
  );
  assert.deepEqual(restored?.attachments, draft.attachments);
  assert.equal("attachments" in taskInputFromDraft(draft), false);
});
