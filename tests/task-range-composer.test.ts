import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialTaskDraft,
  parseTaskDraft,
  taskDraftKey,
  taskInputFromDraft,
} from "../src/lib/task-composer";

test("task composer retains an explicit date range in the save payload and restored draft", () => {
  const draft = initialTaskDraft(null, {
    startDate: "2026-10-21",
    dueDate: "2026-10-25",
  });
  draft.title = "Survey the substations";
  assert.equal(draft.startDate, "2026-10-21");
  const input = taskInputFromDraft(draft);
  assert.equal(input.startDate, "2026-10-21");
  assert.equal(input.dueDate, "2026-10-25");
  const restored = parseTaskDraft(
    JSON.stringify({ savedAt: Date.now(), draft }),
  );
  assert.equal(restored?.startDate, "2026-10-21");
  assert.equal(restored?.dueDate, "2026-10-25");
});

test("legacy task drafts keep their old key and omit an unspecified start date", () => {
  const old = initialTaskDraft(null, { dueDate: "2026-10-25" });
  assert.equal(Object.hasOwn(old, "startDate"), false);
  const key = taskDraftKey("MEMBER@example.com", true, {});
  assert.equal(
    key,
    'evolve-task-draft-v1:demo:member@example.com:[null,null,"todo","none",null,"Asia/Jakarta"]',
  );
  assert.notEqual(
    taskDraftKey("member@example.com", true, {
      startDate: "2026-10-21",
      dueDate: "2026-10-25",
    }),
    taskDraftKey("member@example.com", true, { dueDate: "2026-10-25" }),
  );
  const restored = parseTaskDraft(
    JSON.stringify({ savedAt: Date.now(), draft: old }),
  );
  assert.ok(restored);
  assert.equal(Object.hasOwn(taskInputFromDraft(restored), "startDate"), false);
});
