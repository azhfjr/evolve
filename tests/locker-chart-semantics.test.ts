import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusDonut, ScheduleChart } from "../src/components/overview-charts";
test("Locker status chart exposes exact task counts and meaningful shares", () => {
  const html = renderToStaticMarkup(
    createElement(StatusDonut, {
      statuses: { backlog: 1, todo: 9999, in_progress: 0, review: 0, done: 0 },
      onFilter: () => {},
    }),
  );
  assert.match(html, /&lt;0\.1%/);
  assert.match(html, /10,000/);
  assert.match(html, /<title[^>]*>10000 active tasks by status\./);
  assert.match(html, /Task distribution/);
});
test("scheduled workload explains task-day counting instead of distinct task totals", () => {
  const html = renderToStaticMarkup(
    createElement(ScheduleChart, {
      rows: [{ day: "2026-10-27", count: 2 }],
      onDay: () => {},
    }),
  );
  assert.match(html, /spanning several days is counted on each scheduled day/);
  assert.match(html, /2026-10-27/);
});
