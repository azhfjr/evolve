import assert from "node:assert/strict";
import { test } from "node:test";
import * as labels from "../src/lib/labels";
import { commandSchema, taskFields } from "../src/lib/validation";

test("project hashtags use one lowercase canonical body and display prefix", () => {
  assert.equal(labels.cleanLabel("  ＃ＭＡＰ   Planning  "), "map_planning");
  assert.equal(labels.cleanLabel("##Team / Alpha"), "team_/_alpha");
  assert.equal(labels.displayLabel(" #Map Planning "), "#map_planning");
  assert.deepEqual(
    labels.labelsSchema.parse(["#Map Planning", "ＭＡＰ planning"]),
    ["map_planning"],
  );
  assert.deepEqual(labels.labelsSchema.parse(Array(12).fill("#Same")), [
    "same",
  ]);
});

test("project hashtags reject empty, invisible, control and oversized bodies", () => {
  for (const value of ["#", "##  ", "a\u200bb", "a\nb", "a".repeat(31)])
    assert.equal(labels.labelsSchema.safeParse([value]).success, false, value);
  assert.equal(
    labels.labelsSchema.safeParse(
      Array.from({ length: 11 }, (_, i) => `tag${i}`),
    ).success,
    false,
  );
});

test("task create, import and template inputs cannot define project-owned labels", () => {
  assert.deepEqual(
    taskFields.parse({ title: "Compatible task", labels: [] }).labels,
    [],
  );
  assert.equal(
    taskFields.safeParse({ title: "Independent tag", labels: ["tag"] }).success,
    false,
  );
  for (const command of [
    { action: "createTask", task: { title: "Task", labels: ["tag"] } },
    {
      action: "importTasks",
      idempotencyKey: crypto.randomUUID(),
      tasks: [{ title: "Task", labels: ["tag"] }],
    },
    {
      action: "saveTemplate",
      name: "Template",
      body: { title: "Task", labels: ["tag"] },
    },
    {
      action: "updateTask",
      id: crypto.randomUUID(),
      version: 1,
      patch: { labels: [] },
    },
  ]) {
    const parsed = commandSchema.safeParse(command);
    assert.equal(parsed.success, false, command.action);
    if (!parsed.success)
      assert.match(parsed.error.message, /managed on (the )?project/i);
  }
});

test("legacy project hashtags remain readable without rewriting or truncating their source", () => {
  const raw = ["#", "##", "İ".repeat(30), "#Design System", "design system"];
  assert.deepEqual(labels.readProjectLabels(raw), [
    "i\u0307".repeat(30),
    "design_system",
  ]);
  assert.equal(raw[0], "#");
  assert.deepEqual(labels.labelsSchema.parse(labels.readProjectLabels(raw)), [
    "i\u0307".repeat(30),
    "design_system",
  ]);
});

test("visible-character limits also bound long combining sequences", () => {
  assert.equal(
    labels.labelsSchema.safeParse(["a" + "\u0301".repeat(200)]).success,
    false,
  );
});

test("the project label editor rejects an unfinished bare hashtag instead of silently dropping it", () => {
  assert.throws(() => labels.mergeLabels([], "#"));
  assert.deepEqual(labels.mergeLabels(["valid"], ""), ["valid"]);
});
