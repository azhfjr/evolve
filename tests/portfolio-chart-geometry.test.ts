import { test } from "node:test";
import assert from "node:assert/strict";
import { chartRatios, pieSegments } from "../src/lib/portfolio-chart-geometry";
test("chart ratios retain zero and remain finite for large exact capacity totals", () => {
  assert.deepEqual(chartRatios(["0", "10", "20"]), [0, 0.5, 1]);
  assert.deepEqual(
    chartRatios(["1" + "0".repeat(309), "5" + "0".repeat(308)]),
    [1, 0.5],
  );
  assert.deepEqual(chartRatios([]), []);
  assert.deepEqual(chartRatios(["0", "0"]), [0, 0]);
});
test("pie partitions cover the full circle, omit zero slices and preserve original indexes", () => {
  const p = pieSegments([0, 1, 3]);
  assert.equal(p.length, 2);
  assert.equal(p[0].index, 1);
  assert.equal(p[0].fraction, 0.25);
  assert.equal(p[1].end, 360);
  assert.deepEqual(pieSegments([0, 0]), []);
  assert.equal(pieSegments([4])[0].fraction, 1);
});
test("axis labels format very large totals without Infinity", async () => {
  const { chartTick } = await import("../src/lib/portfolio-chart-geometry");
  assert.equal(chartTick("100", 0.5), "50");
  assert.equal(chartTick("1" + "0".repeat(309), 0.5), "5e308");
});
test("zero stays finite beside subnormal valid capacity", () => {
  const ratios = chartRatios(["0", "0." + "0".repeat(308) + "1"]);
  assert.deepEqual(ratios, [0, 1]);
});
