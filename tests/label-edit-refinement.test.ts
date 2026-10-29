import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renameProjectLabel,
  selectionAfterLabelEdit,
} from "../src/lib/label-edit";

test("renaming a project label canonicalizes, preserves order/others, and deduplicates", () => {
  const original = ["design", "ux"];
  assert.deepEqual(
    renameProjectLabel(original, "#Design", " #Delivery Planning "),
    ["delivery_planning", "ux"],
  );
  assert.deepEqual(original, ["design", "ux"]);
  assert.deepEqual(renameProjectLabel(original, "design", "#UX"), ["ux"]);
  const full = Array.from({ length: 10 }, (_, i) => `label_${i}`);
  assert.equal(renameProjectLabel(full, "label_3", "renamed").length, 10);
});

test("a rename rejects empty, hidden, overlong, multiple, and stale labels", () => {
  for (const name of ["#", "", "x".repeat(31), "one,two", "unsafe\u200b"]) {
    assert.throws(() => renameProjectLabel(["design"], "design", name));
  }
  assert.throws(() => renameProjectLabel(["design"], "missing", "new"));
  assert.deepEqual(renameProjectLabel(["design"], "design", "👩".repeat(30)), [
    "👩".repeat(30),
  ]);
});

test("map selection follows a rename/removal and keeps an unchanged selected label", () => {
  assert.equal(
    selectionAfterLabelEdit("design", ["design", "ux"], ["delivery", "ux"]),
    "delivery",
  );
  assert.equal(
    selectionAfterLabelEdit("ux", ["design", "ux"], ["delivery", "ux"]),
    "ux",
  );
  assert.equal(
    selectionAfterLabelEdit("design", ["design", "ux"], ["ux"]),
    "ux",
  );
  assert.equal(
    selectionAfterLabelEdit("stale", ["fresh"], ["renamed"]),
    "renamed",
  );
  assert.equal(selectionAfterLabelEdit("design", ["design"], []), "");
});

test("a map follows the explicit rename target when merging with an existing label", () => {
  assert.equal(
    selectionAfterLabelEdit(
      "constructor",
      ["constructor", "planning"],
      ["planning"],
    ),
    "planning",
  );
  assert.equal(
    selectionAfterLabelEdit(
      "ux",
      ["design", "ux", "planning"],
      ["design", "planning"],
      { ux: "design" },
    ),
    "design",
  );
  assert.equal(
    selectionAfterLabelEdit(
      "ux",
      ["design", "ux", "planning"],
      ["design", "planning"],
      { ux: "missing" },
    ),
    "planning",
  );
});
