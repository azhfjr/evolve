import { test } from "node:test";
import assert from "node:assert/strict";
import { demoDashboard } from "../src/lib/dashboard-model";
import { createDemo } from "../src/lib/demo";

test("overview snapshots exclude archives and done work from open buckets", () => {
  const data = createDemo();
  const template = data.tasks[0];
  data.tasks = [
    {
      ...template,
      id: "open",
      status: "todo",
      priority: "urgent",
      dueDate: "2026-10-20",
      assignee: null,
    },
    {
      ...template,
      id: "done",
      status: "done",
      priority: "urgent",
      dueDate: "2026-10-19",
      archived: false,
    },
    { ...template, id: "archive", status: "todo", archived: true },
  ];
  const report = demoDashboard(data, 7, new Date("2026-10-20T10:00:00Z"));
  assert.equal(report.totals.total, 2);
  assert.equal(report.totals.open, 1);
  assert.equal(report.priorities.urgent, 1);
  assert.deepEqual(report.deadlineBuckets, {
    overdue: 0,
    today: 1,
    future: 0,
    unscheduled: 0,
  });
  assert.equal(
    report.workload.reduce((n, row) => n + row.count, 0),
    1,
  );
  assert.equal(
    report.projectProgress.find((p) => p.id === template.projectId)?.total,
    2,
  );
});

test("trend uses the account calendar date and keeps archived delivery history", () => {
  const data = createDemo();
  data.profile = { ...data.profile!, timeZone: "Asia/Jakarta" };
  data.tasks = [
    {
      ...data.tasks[0],
      archived: true,
      createdAt: "2026-10-19T18:00:00.000Z",
      completedAt: "2026-10-19T19:00:00.000Z",
    },
  ];
  const report = demoDashboard(data, 7, new Date("2026-10-19T20:00:00Z"));
  assert.equal(report.today, "2026-10-20");
  assert.deepEqual(report.trend.at(-1), {
    day: "2026-10-20",
    created: 1,
    completed: 1,
  });
  assert.equal(report.totals.total, 0);
  assert.equal(report.trend.length, 7);
});

test("period changes only trend and deadline buckets partition open work", () => {
  const data = createDemo(),
    now = new Date("2026-10-20T10:00:00Z");
  const template = data.tasks[0];
  data.tasks = ["2026-10-19", "2026-10-20", "2026-10-21", null].map(
    (dueDate, i) => ({
      ...template,
      id: String(i),
      status: "todo",
      archived: false,
      dueDate,
    }),
  );
  const week = demoDashboard(data, 7, now),
    quarter = demoDashboard(data, 90, now);
  assert.deepEqual(week.deadlineBuckets, {
    overdue: 1,
    today: 1,
    future: 1,
    unscheduled: 1,
  });
  assert.deepEqual(week.totals, quarter.totals);
  assert.deepEqual(week.projectProgress, quarter.projectProgress);
  assert.equal(quarter.trend.length, 90);
  data.tasks = [];
  const empty = demoDashboard(data, 7, now);
  assert.equal(empty.totals.total, 0);
  assert.equal(empty.workload.length, 0);
  assert.ok(empty.projectProgress.every((project) => project.total === 0));
});
