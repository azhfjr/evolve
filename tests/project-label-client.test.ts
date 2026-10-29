import { previewCSV, CSV_EXAMPLE } from "../src/lib/csv-import";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../src/lib/demo";
import { demoCommand } from "../src/lib/client-store";
import {
  initialTaskDraft,
  parseTaskDraft,
  taskInputFromDraft,
} from "../src/lib/task-composer";
import {
  connectionItemsSchema,
  connectionQuerySchema,
  demoConnections,
} from "../src/lib/connection-model";

test("task payloads omit retired independent labels while preserving unsaved content", () => {
  const draft = initialTaskDraft(null, {});
  draft.title = "Keep this draft";
  draft.description = "Unsaved notes";
  draft.labels = ["Legacy label"];
  draft.pendingLabels = "Old pending label";
  const input = taskInputFromDraft(draft);
  assert.equal(Object.hasOwn(input, "labels"), false);
  assert.equal(input.title, draft.title);
  assert.equal(input.description, draft.description);
});

test("legacy task drafts restore their content without reactivating task labels", () => {
  const draft = initialTaskDraft(null, {});
  draft.title = "Restore my work";
  draft.description = "Still important";
  draft.labels = ["Legacy"];
  draft.pendingLabels = "Pending legacy";
  const savedAt = Date.now();
  const restored = parseTaskDraft(JSON.stringify({ savedAt, draft }), savedAt);
  assert.ok(restored);
  assert.equal(restored.title, draft.title);
  assert.equal(restored.description, draft.description);
  assert.deepEqual(restored.labels, []);
  assert.equal(restored.pendingLabels, "");
});

test("demo connections inherit project labels and ignore task-only labels", () => {
  const data = createDemo();
  data.projects[0].labels = ["#Road MAP"];
  data.tasks[0].projectId = data.projects[0].id;
  data.tasks[0].labels = ["retired_unique_label"];
  const items = connectionItemsSchema.parse(
    demoConnections(
      data,
      connectionQuerySchema.parse({ mode: "items", label: "#Road MAP" }),
    ),
  );
  assert.ok(
    items.items.some(
      (item) => item.kind === "task" && item.id === data.tasks[0].id,
    ),
  );
  assert.deepEqual(
    items.items.find((item) => item.id === data.tasks[0].id)?.labels,
    ["road_map"],
  );
  const retired = connectionItemsSchema.parse(
    demoConnections(
      data,
      connectionQuerySchema.parse({
        mode: "items",
        label: "retired_unique_label",
      }),
    ),
  );
  assert.equal(retired.total, 0);
});

test("moving a demo task changes its inherited labels and No project clears them", () => {
  const data = createDemo();
  data.projects[0].labels = ["first"];
  data.projects[1].labels = ["second"];
  data.tasks[0].projectId = data.projects[0].id;
  const moved = demoCommand(
    data,
    {
      action: "updateTask",
      id: data.tasks[0].id,
      version: data.tasks[0].version,
      patch: { projectId: data.projects[1].id },
    },
    false,
  );
  const task = moved.data.tasks.find((item) => item.id === data.tasks[0].id)!;
  assert.deepEqual(task.labels, ["second"]);
  const cleared = demoCommand(
    moved.data,
    {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { projectId: null },
    },
    false,
  );
  assert.deepEqual(
    cleared.data.tasks.find((item) => item.id === task.id)?.labels,
    [],
  );
});

test("the CSV example imports without trying to create task-owned labels", () => {
  const preview = previewCSV(CSV_EXAMPLE, [], []);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.tasks.length, 1);
  assert.deepEqual(preview.tasks[0].labels, []);
});

test("hashtag search matches inherited labels in the task list and directory", async () => {
  const { matchesTaskSearch } = await import("../src/lib/project-labels");
  const data = createDemo();
  data.projects[0].labels = ["Design System"];
  data.tasks[0].projectId = data.projects[0].id;
  const task = {
    ...data.tasks[0],
    title: "A neutral title",
    description: "Context",
    labels: ["design_system"],
  };
  assert.equal(matchesTaskSearch(task, "#DESIGN SYSTEM"), true);
  assert.equal(matchesTaskSearch(task, "context"), true);
  assert.equal(matchesTaskSearch(task, "#missing"), false);
  assert.equal(matchesTaskSearch(task, "#"), false);
  const catalog = demoConnections(
    data,
    connectionQuerySchema.parse({ q: "#DESIGN SYSTEM" }),
  );
  assert.equal(
    "groups" in catalog &&
      catalog.groups.some((group) => group.key === "design_system"),
    true,
  );
});
