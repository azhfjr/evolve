import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mappingStorageKey,
  readSavedMapping,
  serializeSavedMapping,
  mappingForHeaders,
} from "../src/lib/board-room/import-mappings";
import { renderPortfolioReport } from "../src/lib/board-room/report-format";
import { EMPTY_QUERY } from "../src/lib/board-room/model";

test("personal mappings are scoped to account and reject retired or malformed fields", () => {
  assert.notEqual(
    mappingStorageKey("admin@example.com"),
    mappingStorageKey("member@example.com"),
  );
  assert.equal(
    mappingStorageKey(" ADMIN@example.com "),
    mappingStorageKey("admin@example.com"),
  );
  assert.equal(readSavedMapping("broken"), null);
  assert.equal(
    readSavedMapping(
      JSON.stringify({
        version: 1,
        name: "Bad",
        mapping: { categoryIds: "Tags" },
      }),
    ),
    null,
  );
  assert.equal(
    readSavedMapping(
      JSON.stringify({
        version: 1,
        name: "Bad",
        mapping: { externalId: "Ref", name: "Ref" },
      }),
    ),
    null,
  );
  const serialized = serializeSavedMapping("My yearly list", {
    externalId: "Ref",
    name: "Title",
    category: "Kind",
  });
  const saved = readSavedMapping(serialized)!;
  assert.equal(saved.name, "My yearly list");
  assert.deepEqual(saved.mapping, {
    externalId: "Ref",
    name: "Title",
    category: "Kind",
  });
  assert.deepEqual(mappingForHeaders(saved.mapping, ["Ref", "Title"]), {
    externalId: "Ref",
    name: "Title",
  });
});

test("meeting reports escape content and preserve filtered units, human validity and stage meaning", () => {
  const html = renderPortfolioReport({
    generatedAt: "2026-10-24T09:00:00.000Z",
    timeZone: "Asia/Bangkok",
    generatedBy: "Admin <admin@example.com>",
    query: { ...EMPTY_QUERY, category: "Pembangkit", year: "2028" },
    stages: Array.from({ length: 10 }, (_, i) => `Stage ${i + 1}`),
    rows: [
      {
        externalId: "K-1",
        name: '<script>alert("x")</script>',
        category: "Pembangkit",
        scope: "Build",
        voltage: "150 kV",
        capacity: 10,
        unit: "MW",
        codYear: 2028,
        startYear: 2026,
        stage: 5,
        completed: false,
        valid: true,
        fileCount: 2,
        responsible: "Team A",
        progressReviewedAt: null,
        progressReviewedBy: null,
        progressReviewNote: "",
        documentReviewNote: "Approved source",
      },
      {
        externalId: "K-2",
        name: "Storage",
        category: "Pembangkit",
        scope: "",
        voltage: "",
        capacity: 20,
        unit: "MWh",
        codYear: 2028,
        startYear: null,
        stage: 0,
        completed: false,
        valid: false,
        fileCount: 0,
        responsible: "",
        progressReviewedAt: null,
        progressReviewedBy: null,
        progressReviewNote: "",
        documentReviewNote: "",
      },
    ],
  });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("10 MW"));
  assert.ok(html.includes("20 MWh"));
  assert.ok(!html.includes("30 MW"));
  assert.ok(html.includes("Stage 5"));
  assert.ok(html.includes("not a percentage"));
  assert.ok(html.includes("Valid · 2 files"));
  assert.ok(html.includes("No files"));
  assert.ok(html.includes("Pembangkit"));
  assert.ok(html.includes("2028"));
  assert.ok(html.includes("16:00"));
  assert.ok(html.replace(/<[^>]*>/g, "").includes("2 projects"));
});

test("metadata-only CSV merges preserve deliberate review evidence and checklist", async () => {
  const { mergeImportedProject } = await import("../src/lib/board-room/csv");
  const base = {
    externalId: "K-3",
    name: "Old name",
    category: "Pembangkit" as const,
    capacity: 10,
    unit: "MW",
    codYear: 2028,
    startYear: 2026,
    description: "",
    location: "",
    links: [],
    linkLabels: [],
    scope: "",
    voltage: "",
    stage: 4,
    completed: false,
    progressReviewedAt: "2026-10-24T09:00:00Z",
    progressReviewedBy: "admin@example.com",
    progressReviewNote: "Confirmed",
    documentReviewNote: "Evidence checked",
  };
  const result = mergeImportedProject(base, { name: "New name" }, false);
  assert.equal(result.name, "New name");
  assert.equal(result.progressReviewedAt, base.progressReviewedAt);
  assert.equal(result.documentReviewNote, "Evidence checked");
});

test("CSV workflow changes require a fresh deliberate progress review", async () => {
  const { mergeImportedProject } = await import("../src/lib/board-room/csv");
  const base = {
    externalId: "K-4",
    name: "Existing",
    category: "Pembangkit" as const,
    capacity: 10,
    unit: "MW",
    codYear: 2028,
    startYear: 2026,
    description: "",
    location: "",
    links: [],
    linkLabels: [],
    scope: "",
    voltage: "",
    stage: 4,
    completed: false,
    progressReviewedAt: "2026-10-24T09:00:00Z",
    progressReviewedBy: "admin@example.com",
    progressReviewNote: "Confirmed",
    documentReviewNote: "Evidence checked",
  };
  const protectedResult = mergeImportedProject(base, { stage: 5 }, false);
  assert.equal(protectedResult.progressReviewedAt, base.progressReviewedAt);
  const changed = mergeImportedProject(base, { stage: 5 }, true);
  assert.equal(changed.stage, 5);
  assert.equal(changed.progressReviewedAt, null);
  assert.equal(changed.progressReviewedBy, null);
  assert.equal(changed.progressReviewNote, "");
  assert.equal(changed.documentReviewNote, "Evidence checked");
});

test("CSV yearly planning changes invalidate progress review independently of stage override", async () => {
  const { mergeImportedProject } = await import("../src/lib/board-room/csv");
  const existing = {
    externalId: "YEAR-REVIEW",
    name: "Reviewed yearly plan",
    category: "Pembangkit" as const,
    capacity: 10,
    unit: "MW",
    codYear: 2028,
    startYear: 2026,
    description: "",
    location: "",
    links: [],
    linkLabels: [],
    scope: "",
    voltage: "",
    stage: 4,
    completed: false,
    progressReviewedAt: "2026-10-24T09:00:00Z",
    progressReviewedBy: "admin@example.com",
    progressReviewNote: "Yearly plan and current stage confirmed",
    documentReviewNote: "Evidence checked",
  };
  const unchanged = mergeImportedProject(
    existing,
    { startYear: 2026, codYear: 2028 },
    false,
  );
  assert.equal(unchanged.progressReviewedAt, existing.progressReviewedAt);
  for (const patch of [{ startYear: 2027 }, { codYear: 2029 }]) {
    const changed = mergeImportedProject(existing, patch, false);
    assert.equal(changed.stage, existing.stage);
    assert.equal(changed.progressReviewedAt, null);
    assert.equal(changed.progressReviewedBy, null);
    assert.equal(changed.progressReviewNote, "");
    assert.equal(changed.documentReviewNote, "Evidence checked");
  }
});
