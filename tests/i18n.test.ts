import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getTranslator,
  localizedDate,
  formatNumber,
  validLocale,
} from "../src/lib/i18n/core";
import { messages } from "../src/lib/i18n/messages";
import { eventMessage } from "../src/lib/i18n/events";
import { validationSummary } from "../src/lib/i18n/validation";
import { taskFields } from "../src/lib/validation";
import { preferenceSchema } from "../src/lib/preferences";
import { previewCSV } from "../src/lib/csv-import";
test("every interface translation preserves its interpolation parameters", () => {
  const params = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, [en, id]] of Object.entries(messages)) {
    assert.ok(en.trim() && id.trim(), key);
    assert.deepEqual(params(en), params(id), key);
  }
});
test("both locales translate known copy and preserve arbitrary user content", () => {
  const en = getTranslator("en"),
    id = getTranslator("id");
  assert.equal(id("New task"), "Task baru");
  assert.equal(en("Task baru"), "New task");
  assert.equal(
    id("Restore {title}", { title: "Review {budget} <script>" }),
    "Pulihkan Review {budget} <script>",
  );
  assert.equal(id("An original task title"), "An original task title");
  assert.equal(validLocale("fr"), false);
  assert.equal(preferenceSchema.parse({}).locale, "en");
  assert.equal(preferenceSchema.safeParse({ locale: "xx" }).success, false);
});
test("date and number formats follow the selected language without changing ISO values", () => {
  assert.equal(
    localizedDate("2026-12-15", "MMMM d, yyyy", "en"),
    "December 15, 2026",
  );
  assert.equal(
    localizedDate("2026-12-15", "MMMM d, yyyy", "id"),
    "15 Desember 2026",
  );
  assert.equal(localizedDate("2026-12-15", "yyyy-MM-dd", "id"), "2026-12-15");
  assert.equal(formatNumber(1234.5, "id"), "1.234,5");
  assert.equal(formatNumber(1234.5, "en"), "1,234.5");
});
test("system activity localizes verbs while preserving names and task titles", () => {
  assert.equal(
    eventMessage("archived “New task”", "id"),
    "mengarsipkan “New task”",
  );
  assert.equal(
    eventMessage("Rensist assigned you “Keep this title”", "id"),
    "Rensist menugaskan “Keep this title” kepada Anda",
  );
  assert.equal(
    eventMessage("moved “Keep this title” to in_progress", "id"),
    "memindahkan “Keep this title” ke Sedang dikerjakan",
  );
  assert.equal(
    eventMessage("An unknown activity", "en"),
    "An unknown activity",
  );
});
test("validation and CSV row errors use the chosen locale", () => {
  const result = taskFields.safeParse({ title: "" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(validationSummary(result.error.issues, "id"), /karakter/);
    assert.match(validationSummary(result.error.issues, "en"), /characters/);
  }
  assert.match(
    previewCSV("Title,Description\n,Missing title", [], [], null, "en")
      .errors[0]?.message || "",
    /characters/,
  );
  const csv = "Title,Assignee\nMy task,nobody@example.com";
  assert.match(
    previewCSV(csv, [], [], null, "en").errors[0].message,
    /active member/,
  );
  assert.match(
    previewCSV(csv, [], [], null, "id").errors[0].message,
    /anggota aktif/,
  );
});
