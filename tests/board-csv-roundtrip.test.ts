import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CSV_COLUMNS,
  exportProjectCSV,
  parseProjectCSV,
  mergeImportedProject,
  readCSV,
} from "../src/lib/board-room/csv";
import { PROJECT_HEADERS } from "../src/lib/connected/project-csv";
import { projectSchema } from "../src/lib/board-room/model";
test("CSV preserves completion, labelled links, repeated URLs scope and voltage exactly", () => {
  const input = {
    ...projectSchema.parse({
      externalId: "ROUND-01",
      name: "Full project",
      category: "Pembangkit",
      scope: "Double circuit; north extension",
      voltage: "275/150 kV",
      location: "Kalimantan Barat",
      capacity: 12.5,
      unit: "MWac",
      startYear: 2027,
      codYear: 2030,
      description: "Line 1\nLine 2",
      links: ["https://example.com/a;b", "https://example.com/a;b"],
      linkLabels: ["Charter; signed", "Study, approved"],
    }),
    stage: 10,
    completed: true,
  };
  const rows = parseProjectCSV(exportProjectCSV([input]));
  const next = mergeImportedProject(undefined, rows[0].patch, true);
  assert.deepEqual(next, input);
});
test("explicit zero stage and completion changes honor workflow-import protection", () => {
  const existing = {
    ...projectSchema.parse({ externalId: "P-1", name: "Done" }),
    stage: 10,
    completed: true,
  };
  const patch = parseProjectCSV(
    "RUPTL Code,Current stage,Completed\nP-1,0,false",
  )[0].patch;
  assert.equal(mergeImportedProject(existing, patch, true).stage, 0);
  assert.equal(mergeImportedProject(existing, patch, true).completed, false);
  assert.equal(mergeImportedProject(existing, patch, false).completed, true);
  assert.throws(() =>
    mergeImportedProject(
      undefined,
      { externalId: "P-2", name: "Invalid", stage: 2, completed: true },
      true,
    ),
  );
});
test("download templates and examples use exactly the supported application columns", () => {
  assert.ok(Object.hasOwn(CSV_COLUMNS, "linkLabels"));
  assert.ok(Object.hasOwn(CSV_COLUMNS, "completed"));
  const headers = readCSV(
    readFileSync("public/board-room/project-upload-template.csv", "utf8"),
  )[0];
  assert.deepEqual(headers, PROJECT_HEADERS);
  assert.ok(!headers.some((header) => String(header) === "Scope"));
  assert.equal(headers[0], "Project ID");
  const example = readFileSync(
    "public/board-room/project-upload-example.csv",
    "utf8",
  );
  assert.deepEqual(readCSV(example)[0], headers);
  for (const row of readCSV(example).slice(1)) {
    assert.equal(row.length, headers.length);
    assert.equal(row[0], "");
    assert.ok(row[1]);
  }
});

test("retired custom category columns are ignored while the primary category remains", () => {
  const row = parseProjectCSV(
    "RUPTL Code,Project name,Category,Custom categories\nRETIRED,Test,Transmisi,[Priority]; Solar",
  )[0];
  assert.equal(row.patch.category, "Transmisi");
  assert.equal(Object.hasOwn(row.patch, "customCategoryNames"), false);
  assert.equal(Object.hasOwn(CSV_COLUMNS, "customCategoryNames"), false);
});
