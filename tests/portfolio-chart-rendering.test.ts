import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RoundChart,
  ColumnChart,
  HorizontalBars,
} from "../src/components/board-room/portfolio-charts";
const action = () => {};
test("empty and single-category round charts remain truthful and accessible", () => {
  const empty = renderToStaticMarkup(
    createElement(RoundChart, {
      label: "Portfolio",
      rows: [{ label: "Empty", value: 0, action }],
    }),
  );
  assert.match(empty, /No matching projects/);
  assert.doesNotMatch(empty, /<path[^>]+role="button"/);
  const one = renderToStaticMarkup(
    createElement(RoundChart, {
      label: "Portfolio",
      rows: [{ label: "Only category", value: 4, action }],
    }),
  );
  assert.match(one, /100\.0%/);
  assert.match(one, /tabindex="0"/);
  assert.match(one, /View data/);
});
test("capacity axes remain finite and underlying table preserves exact values", () => {
  const exact = "1" + "0".repeat(309);
  const html = renderToStaticMarkup(
    createElement(ColumnChart, {
      unit: "custom",
      rows: [
        { label: "2028", value: exact, action },
        { label: "2029", value: "0", action },
      ],
    }),
  );
  assert.doesNotMatch(html, /Infinity|NaN/);
  assert.ok(html.includes(exact));
  assert.match(html, /5e308/);
});
test("location data alternative includes every location beyond visible ranked rows", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    label: "Location " + i,
    value: i + 1,
    action,
  }));
  const html = renderToStaticMarkup(
    createElement(HorizontalBars, {
      rows: rows.slice(0, 8),
      completeRows: rows,
      total: 78,
    }),
  );
  assert.match(html, /Location 11/);
  assert.match(html, /15\.4%/);
});
test("capacity table retains measured record counts and meaningful headings", () => {
  const html = renderToStaticMarkup(
    createElement(ColumnChart, {
      unit: "MW",
      rows: [{ label: "2028", value: "25", records: 3, action }],
    }),
  );
  assert.match(html, />COD year</);
  assert.match(html, />Capacity</);
  assert.match(html, />Records</);
  assert.match(html, /<td>3<\/td>/);
});
test("empty capacity distinguishes missing measurements from missing projects", () => {
  const html = renderToStaticMarkup(
    createElement(ColumnChart, {
      unit: "MW",
      rows: [],
      source: "asset",
      projectCount: 2,
    }),
  );
  assert.match(html, /No linked asset capacity recorded/);
  assert.doesNotMatch(html, /No matching projects/);
  const none = renderToStaticMarkup(
    createElement(ColumnChart, { unit: "MW", rows: [], projectCount: 0 }),
  );
  assert.match(none, /No matching projects/);
});
test("all-zero capacity plots expose one truthful zero baseline", () => {
  const html = renderToStaticMarkup(
    createElement(ColumnChart, {
      unit: "MW",
      rows: [{ label: "2028", value: "0", records: 1, action }],
    }),
  );
  assert.equal([...html.matchAll(/<text x="67"[^>]*>0<\/text>/g)].length, 1);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
test("small positive chart shares do not misleadingly round to zero", () => {
  const html = renderToStaticMarkup(
    createElement(RoundChart, {
      label: "Portfolio",
      rows: [
        { label: "Small share", value: 1, action },
        { label: "Other", value: 9999, action },
      ],
    }),
  );
  assert.match(html, /&lt;0\.1%/);
});
