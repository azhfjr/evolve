import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../src/lib/demo";
import { demoDashboard } from "../src/lib/dashboard-model";

test("scheduled workload counts inclusive ranges and legacy end-only tasks without archives or completions", () => {
  const data = createDemo();
  const task = data.tasks[0];
  data.tasks = [
    {
      ...task,
      id: "range",
      status: "todo",
      archived: false,
      startDate: "2026-10-19",
      dueDate: "2026-10-22",
    },
    {
      ...task,
      id: "legacy",
      status: "todo",
      archived: false,
      startDate: null,
      dueDate: "2026-10-21",
    },
    {
      ...task,
      id: "past",
      status: "todo",
      archived: false,
      startDate: "2026-10-18",
      dueDate: "2026-10-19",
    },
    {
      ...task,
      id: "done",
      status: "done",
      archived: false,
      startDate: "2026-10-20",
      dueDate: "2026-10-22",
    },
    {
      ...task,
      id: "archive",
      status: "todo",
      archived: true,
      startDate: "2026-10-20",
      dueDate: "2026-10-22",
    },
    {
      ...task,
      id: "unscheduled",
      status: "todo",
      archived: false,
      startDate: null,
      dueDate: null,
    },
    {
      ...task,
      id: "future",
      status: "todo",
      archived: false,
      startDate: "2026-11-03",
      dueDate: "2026-11-05",
    },
  ];
  const report = demoDashboard(data, 7, new Date("2026-10-20T10:00:00Z"));
  assert.equal(report.schedule.length, 14);
  assert.deepEqual(report.schedule.slice(0, 4), [
    { day: "2026-10-20", count: 1 },
    { day: "2026-10-21", count: 2 },
    { day: "2026-10-22", count: 1 },
    { day: "2026-10-23", count: 0 },
  ]);
  assert.equal(report.schedule.at(-1)?.day, "2026-11-02");
  assert.equal(report.schedule.at(-1)?.count, 0);
});

test("attention groups explicitly count overlapping open-work risks", () => {
  const data = createDemo();
  const task = data.tasks[0];
  data.tasks = [
    {
      ...task,
      id: "overdue-ownerless",
      status: "todo",
      archived: false,
      assignee: null,
      dueDate: "2026-10-19",
    },
    {
      ...task,
      id: "unscheduled-ownerless",
      status: "todo",
      archived: false,
      assignee: null,
      dueDate: null,
    },
    {
      ...task,
      id: "done",
      status: "done",
      archived: false,
      assignee: null,
      dueDate: "2026-10-19",
    },
  ];
  const report = demoDashboard(data, 30, new Date("2026-10-20T10:00:00Z"));
  assert.deepEqual(report.attention, {
    overdue: 1,
    unassigned: 2,
    unscheduled: 1,
  });
  assert.equal(report.totals.open, 2);
  assert.ok(
    Object.values(report.attention).reduce((a, b) => a + b, 0) >
      report.totals.open,
  );
});

test("schedule begins on the account day across UTC month boundary and ignores legacy trend range", () => {
  const data = createDemo();
  data.profile = { ...data.profile!, timeZone: "Asia/Jakarta" };
  data.tasks = [
    {
      ...data.tasks[0],
      status: "todo",
      archived: false,
      startDate: "2026-10-31",
      dueDate: "2026-11-02",
    },
  ];
  const now = new Date("2026-10-31T18:30:00Z");
  const week = demoDashboard(data, 7, now);
  const quarter = demoDashboard(data, 90, now);
  assert.equal(week.today, "2026-11-01");
  assert.deepEqual(week.schedule.slice(0, 3), [
    { day: "2026-11-01", count: 1 },
    { day: "2026-11-02", count: 1 },
    { day: "2026-11-03", count: 0 },
  ]);
  assert.deepEqual(week.schedule, quarter.schedule);
});
