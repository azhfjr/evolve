import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCommand } from "../src/lib/client-store";
import { createDemo } from "../src/lib/demo";
import {
  initialTaskDraft,
  parseTaskDraft,
  taskDraftKey,
  taskInputFromDraft,
} from "../src/lib/task-composer";
import { taskFields } from "../src/lib/validation";

test("saving includes unfinished checklist text while discarding retired task labels", () => {
  const draft = {
    ...initialTaskDraft(null, {}),
    title: "Prepare the report",
    labels: ["Design"],
    pendingLabels: "design, Review, Finance",
    pendingChecklist: " Verify the totals ",
  };
  const parsed = taskFields.parse(taskInputFromDraft(draft));
  assert.deepEqual(parsed.labels, []);
  assert.equal(parsed.checklist.length, 1);
  assert.equal(parsed.checklist[0].text, "Verify the totals");
  assert.match(parsed.checklist[0].id, /^[0-9a-f-]{36}$/);
  assert.equal("pendingChecklist" in parsed, false);
  assert.equal("pendingLabels" in parsed, false);
});
test("pending checklist input cannot silently exceed the server limit", () => {
  const draft = initialTaskDraft(null, {});
  draft.title = "A full checklist";
  draft.checklist = Array.from({ length: 100 }, () => ({
    id: crypto.randomUUID(),
    text: "A step",
    done: false,
  }));
  draft.pendingChecklist = "One step too many";
  assert.equal(taskFields.safeParse(taskInputFromDraft(draft)).success, false);
});
test("draft recovery accepts incomplete titles but rejects corrupt, stale, or invalid data", () => {
  const draft = {
    ...initialTaskDraft(null, {}),
    description: "An unfinished idea",
  };
  const now = 100000000;
  assert.equal(
    parseTaskDraft(JSON.stringify({ savedAt: now - 1000, draft }), now)
      ?.description,
    draft.description,
  );
  for (const value of [
    "broken json",
    JSON.stringify({ savedAt: now - 7 * 86400000 - 1, draft }),
    JSON.stringify({ savedAt: now + 1, draft }),
    JSON.stringify({ savedAt: now, draft: { ...draft, status: "invented" } }),
  ]) {
    assert.equal(parseTaskDraft(value, now), null);
  }
});
test("draft storage separates accounts, demo data, and creation context", () => {
  const key = taskDraftKey("Owner@example.com", false, {});
  assert.equal(key, taskDraftKey("owner@example.com", false, {}));
  assert.notEqual(key, taskDraftKey("another@example.com", false, {}));
  assert.notEqual(key, taskDraftKey("owner@example.com", true, {}));
  assert.notEqual(
    key,
    taskDraftKey("owner@example.com", false, { status: "review" }),
  );
  assert.notEqual(
    key,
    taskDraftKey("owner@example.com", false, { dueDate: "2026-12-01" }),
  );
});
test("editing an unassigned, unscheduled task never inherits creation defaults", () => {
  const task = {
    ...createDemo().tasks[0],
    projectId: null,
    assignee: null,
    dueDate: null,
  };
  const draft = initialTaskDraft(task, {
    projectId: crypto.randomUUID(),
    assignee: "other@example.com",
    dueDate: "2026-12-01",
  });
  assert.equal(draft.projectId, null);
  assert.equal(draft.assignee, null);
  assert.equal(draft.dueDate, null);
});
test("task creation rejects independent labels because projects own them", () => {
  assert.equal(
    taskFields.safeParse({ title: "Research", labels: ["Research"] }).success,
    false,
  );
});

test("legacy demo relationships remain stored without blocking independent task completion", () => {
  const data = createDemo();
  const [parent, child] = data.tasks;
  parent.status = "todo";
  parent.dependencies = [child.id];
  child.parentId = parent.id;
  child.status = "todo";
  const result = demoCommand(
    data,
    {
      action: "updateTask",
      id: parent.id,
      version: 1,
      patch: { status: "done" },
    },
    false,
  );
  assert.equal(
    result.data.tasks.find((task) => task.id === parent.id)?.status,
    "done",
  );
  assert.equal(
    result.data.tasks.find((task) => task.id === child.id)?.parentId,
    parent.id,
  );
  assert.deepEqual(
    result.data.tasks.find((task) => task.id === parent.id)?.dependencies,
    [child.id],
  );
});

test("text task drafts remain recoverable for seven days without expired upload references", () => {
  const draft = initialTaskDraft(null, {});
  draft.title = "Seven day recovery";
  const raw = JSON.stringify({ savedAt: 1000, draft });
  assert.equal(
    parseTaskDraft(raw, 1000 + 2 * 86400000)?.title,
    "Seven day recovery",
  );
  assert.equal(parseTaskDraft(raw, 1000 + 8 * 86400000), null);
});

test("existing-task draft identity and base version remain account and record scoped", () => {
  const a = taskDraftKey("one@example.test", false, {}, "task-one");
  assert.notEqual(a, taskDraftKey("one@example.test", false, {}, "task-two"));
  assert.notEqual(a, taskDraftKey("two@example.test", false, {}, "task-one"));
  const draft = {
    ...initialTaskDraft(null, {}),
    title: "Recovered edit",
    baseVersion: 7,
  };
  const restored = parseTaskDraft(
    JSON.stringify({ savedAt: 1000, draft }),
    1001,
  );
  assert.equal(restored?.baseVersion, 7);
  assert.equal("baseVersion" in taskInputFromDraft(draft), false);
});
