import { test } from "node:test";
import assert from "node:assert/strict";
import { projectFields } from "../src/lib/project-model";
import {
  parseProjectDraft,
  projectDraftKey,
} from "../src/lib/project-composer";
const now = Date.now();
const draft = {
  fields: { ...projectFields.parse({ name: "Draft" }), name: "", budget: "" },
  request: { id: "99000000-0000-4000-8000-000000000001", fingerprint: "" },
};
test("project drafts preserve incomplete input and the request identity without allowing incomplete final commands", () => {
  const restored = parseProjectDraft(
    JSON.stringify({ savedAt: now, draft }),
    now,
  );
  assert.deepEqual(restored, draft);
  assert.equal(projectFields.safeParse(restored!.fields).success, false);
});
test("project drafts reject expired, future, corrupt and oversized storage", () => {
  for (const raw of [
    null,
    "broken",
    JSON.stringify({ savedAt: now - 86400001, draft }),
    JSON.stringify({ savedAt: now + 1, draft }),
    JSON.stringify({
      savedAt: now,
      draft: { ...draft, request: { id: "bad" } },
    }),
    "x".repeat(24001),
  ])
    assert.equal(parseProjectDraft(raw, now), null);
});
test("project drafts are separated by account and demo scope", () => {
  assert.equal(
    projectDraftKey("OWNER@example.com", false),
    projectDraftKey("owner@example.com", false),
  );
  assert.notEqual(
    projectDraftKey("owner@example.com", false),
    projectDraftKey("owner@example.com", true),
  );
  assert.notEqual(
    projectDraftKey("owner@example.com", false),
    projectDraftKey("member@example.com", false),
  );
});

test("completed restored cost groups ignore stale hidden legacy rows", async () => {
  const { projectSubmissionFields } =
    await import("../src/lib/project-composer");
  const input = {
    ...projectFields.parse({ name: "Recovered project" }),
    costItems: [
      {
        id: crypto.randomUUID(),
        title: "",
        currency: "USD" as const,
        amount: "",
      },
    ],
    costOptions: [
      {
        id: crypto.randomUUID(),
        title: "General costs",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Completed visible cost",
            unit: "USD" as const,
            amount: "1250.50",
          },
        ],
      },
    ],
  };
  const parsed = projectSubmissionFields(input);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.costItems, undefined);
    assert.equal(parsed.data.costOptions?.[0].items[0].amount, "1250.50");
  }
});
test("unchanged legacy lost-response draft replays its exact original payload identity", async () => {
  const { projectSubmissionFields } =
    await import("../src/lib/project-composer");
  const { projectCostOptions } = await import("../src/lib/project-model");
  const original = projectFields.parse({
    name: "Already committed",
    costItems: [
      {
        id: crypto.randomUUID(),
        title: "Equipment",
        currency: "USD",
        amount: "125.50",
      },
    ],
  });
  const fingerprint = JSON.stringify(original);
  const hydrated = { ...original, costOptions: projectCostOptions(original) };
  const replay = projectSubmissionFields(hydrated, fingerprint);
  assert.equal(replay.success, true);
  if (replay.success) assert.equal(JSON.stringify(replay.data), fingerprint);
  const changed = projectSubmissionFields(
    { ...hydrated, name: "Changed project" },
    fingerprint,
  );
  assert.equal(changed.success, true);
  if (changed.success) {
    assert.notEqual(JSON.stringify(changed.data), fingerprint);
    assert.equal(changed.data.costOptions?.length, 1);
  }
});
