import { test } from "node:test";
import assert from "node:assert/strict";
import * as regions from "../src/lib/board-room/regions";
import { chartQuery } from "../src/lib/board-room/chart-filters";
import { querySchema } from "../src/lib/board-room/model";
test("regional aliases classify complete values without guessing cities", () => {
  assert.equal(typeof regions.classifyRegion, "function");
  for (const [value, code] of [
    [" Kalbar ", "ID-KB"],
    ["West Kalimantan", "ID-KB"],
    ["62", "ID-KT"],
    ["South Kalimantan", "ID-KS"],
    ["id_ki", "ID-KI"],
    ["Kaltara", "ID-KU"],
    ["65", "ID-KU"],
  ])
    assert.equal(regions.classifyRegion(value), code);
  for (const value of [
    "Kalimantan",
    "Pontianak",
    "Kalimantan Barat; Kalimantan Tengah",
    "West Kalimantan extra",
  ])
    assert.equal(regions.classifyRegion(value), "unrecognized");
  assert.equal(regions.classifyRegion(" \t "), "missing");
});
test("region filters clear competing geographic modes but preserve portfolio context", () => {
  const old = querySchema.parse({
    location: "Kalimantan Barat",
    category: "Pembangkit",
    year: "2028",
    page: 4,
  });
  const selected = chartQuery(old, { region: "ID-KU" });
  assert.equal(selected.location, "");
  assert.equal(selected.region, "ID-KU");
  assert.equal(selected.category, "Pembangkit");
  assert.equal(selected.year, "2028");
  assert.equal(selected.page, 1);
  assert.equal(chartQuery(selected, { missingLocation: true }).region, "");
  assert.equal(
    chartQuery(selected, { location: "Kalimantan Timur" }).region,
    "",
  );
});
test("punctuation is unrecognized rather than a missing recorded location", () => {
  assert.equal(regions.classifyRegion("---"), "unrecognized");
  assert.equal(regions.classifyRegion(".."), "unrecognized");
});
