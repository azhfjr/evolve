import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSchema } from "../src/lib/board-room/model";
import {
  parseProjectCSV,
  mergeImportedProject,
} from "../src/lib/board-room/csv";
const base = {
  externalId: "P-1",
  name: "Power project",
  category: "Pembangkit" as const,
  capacity: 50,
  unit: "MWp",
  startYear: 2026,
  codYear: 2028,
  description: "",
  location: "",
  links: [],
};
test("Board Room validates year-only ranges, units and safe links", () => {
  assert.equal(projectSchema.parse(base).capacity, 50);
  for (const patch of [
    { codYear: 2025 },
    { codYear: "2028-01-01" },
    { capacity: -1 },
    { unit: "" },
    { links: ["javascript:alert(1)"] },
    { links: ["https://user:secret@example.com"] },
  ])
    assert.equal(projectSchema.safeParse({ ...base, ...patch }).success, false);
  assert.equal(
    projectSchema.parse({ ...base, unit: "custom unit" }).unit,
    "custom unit",
  );
});
test("CSV handles quoted names, mapping and duplicate identities", () => {
  const rows = parseProjectCSV('Ref,Title,Type\r\nP-1,"A, B",Pembangkit\r\n', {
    externalId: "Ref",
    name: "Title",
    category: "Type",
  });
  assert.equal(rows[0].patch.name, "A, B");
  assert.throws(() =>
    parseProjectCSV("Project ID,Project name\nP-1,One\nP-1,Two"),
  );
  assert.throws(() =>
    parseProjectCSV('Project ID,Project name\nP-1,"Unclosed'),
  );
});
test("CSV blanks preserve existing fields and stage override is explicit", () => {
  const existing = { ...projectSchema.parse(base), stage: 6, completed: false };
  const row = parseProjectCSV(
    "Project ID,Project name,Capacity,Current stage\nP-1,,,2",
  )[0];
  const merged = mergeImportedProject(existing, row.patch, false);
  assert.equal(merged.name, base.name);
  assert.equal(merged.capacity, 50);
  assert.equal(merged.stage, 6);
  assert.equal(mergeImportedProject(existing, row.patch, true).stage, 2);
  assert.throws(() =>
    mergeImportedProject(undefined, { externalId: "P-2" }, false),
  );
});

test("optional primary categories and labeled links preserve explicit unknown data", () => {
  const value = projectSchema.parse({
    externalId: "UNCLASSIFIED",
    name: "Project without classification",
    links: ["https://example.com"],
    linkLabels: ["Project charter"],
  });
  assert.equal(value.category, "");
  assert.equal(value.codYear, null);
  assert.equal(value.linkLabels[0], "Project charter");
  assert.equal(
    projectSchema.safeParse({ ...value, linkLabels: ["One", "Too many"] })
      .success,
    false,
  );
});

test("unchanged CSV links preserve admin labels while replacing URLs clears old labels", () => {
  const existing = {
    ...projectSchema.parse({
      ...base,
      links: ["https://example.com/charter"],
      linkLabels: ["Charter"],
    }),
    stage: 2,
    completed: false,
  };
  assert.deepEqual(
    mergeImportedProject(
      existing,
      { externalId: "P-1", links: ["https://example.com/charter"] },
      false,
    ).linkLabels,
    ["Charter"],
  );
  assert.deepEqual(
    mergeImportedProject(
      existing,
      { externalId: "P-1", links: ["https://example.com/replacement"] },
      false,
    ).linkLabels,
    [],
  );
});

test("Scope and Voltage validate text and numeric input and reject retired custom assignments", () => {
  assert.equal(
    projectSchema.parse({ ...base, scope: "New line", voltage: 150 }).voltage,
    "150",
  );
  assert.equal(
    projectSchema.parse({ ...base, voltage: "275/150 kV" }).voltage,
    "275/150 kV",
  );
  assert.equal(projectSchema.parse(base).scope, "");
  for (const patch of [
    { scope: "x".repeat(501) },
    { voltage: "x".repeat(121) },
    { voltage: true },
    { voltage: Number.POSITIVE_INFINITY },
    { categoryIds: [crypto.randomUUID()] },
  ])
    assert.equal(projectSchema.safeParse({ ...base, ...patch }).success, false);
});
