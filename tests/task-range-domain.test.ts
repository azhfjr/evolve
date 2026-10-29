import { test } from "node:test";
import assert from "node:assert/strict";
import { commandSchema } from "../src/lib/validation";
import { calendarEventBody } from "../src/lib/calendar/google";
import { previewCSV } from "../src/lib/csv-import";
import {
  taskOccursOn,
  taskRangeError,
  shiftTaskStartDate,
} from "../src/lib/task-range";
import { createDemo } from "../src/lib/demo";
import { demoCommand } from "../src/lib/client-store";
import { csvExport } from "../src/lib/utils";

const id = "10000000-0000-4000-8000-000000000001";
test("task commands accept inclusive ranges without changing legacy payloads", () => {
  const legacy = commandSchema.parse({
    action: "createTask",
    task: { title: "Legacy" },
  });
  assert.equal(legacy.action, "createTask");
  if (legacy.action !== "createTask") return;
  assert.equal(Object.hasOwn(legacy.task, "startDate"), false);
  const valid = commandSchema.parse({
    action: "createTask",
    task: { title: "Range", startDate: "2026-10-20", dueDate: "2026-10-23" },
  });
  assert.equal(
    valid.action === "createTask" && valid.task.startDate,
    "2026-10-20",
  );
  for (const task of [
    { title: "Invalid", startDate: "2026-10-24", dueDate: "2026-10-23" },
    { title: "Invalid", startDate: "2026-10-20" },
    { title: "Invalid", startDate: "2026-02-30", dueDate: "2026-03-02" },
  ])
    assert.equal(
      commandSchema.safeParse({ action: "createTask", task }).success,
      false,
    );
  assert.equal(
    commandSchema.safeParse({
      action: "updateTask",
      id,
      version: 1,
      patch: { startDate: "2026-10-24", dueDate: "2026-10-23" },
    }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      action: "bulkUpdateTasks",
      idempotencyKey: id,
      items: [{ id, version: 1 }],
      patch: { startDate: "2026-10-20", dueDate: "2026-10-23" },
    }).success,
    true,
  );
});

test("Calendar all-day task ranges preserve inclusive end and timed deadlines", () => {
  const allDay = calendarEventBody(
    { id, title: "Range", startDate: "2026-10-20", dueDate: "2026-10-23" },
    "Asia/Jakarta",
    [15],
    "https://example.com",
  );
  assert.deepEqual(allDay.start, { date: "2026-10-20" });
  assert.deepEqual(allDay.end, { date: "2026-10-24" });
  const timed = calendarEventBody(
    {
      id,
      title: "Range",
      startDate: "2026-10-20",
      dueDate: "2026-10-23",
      dueTime: "15:00",
      dueTimeZone: "Asia/Jakarta",
    },
    "UTC",
    [15],
    "https://example.com",
  );
  assert.deepEqual(timed.start, {
    dateTime: "2026-10-19T17:00:00.000Z",
    timeZone: "Asia/Jakarta",
  });
  assert.deepEqual(timed.end, {
    dateTime: "2026-10-23T08:00:00.000Z",
    timeZone: "Asia/Jakarta",
  });
});

test("CSV validates start/end ranges and still accepts legacy due-date CSV", () => {
  const preview = previewCSV(
    "Title,Start date,End date\r\nRange,2026-10-20,2026-10-23",
    [],
    [],
  );
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.tasks[0].startDate, "2026-10-20");
  assert.equal(preview.tasks[0].dueDate, "2026-10-23");
  const invalid = previewCSV(
    "Title,Start date,End date\r\nRange,2026-10-24,2026-10-23",
    [],
    [],
  );
  assert.equal(invalid.tasks.length, 0);
  assert.equal(invalid.errors.length, 1);
  assert.equal(
    previewCSV("Title,Due date\r\nLegacy,2026-10-23", [], []).tasks.length,
    1,
  );
});

test("inclusive ranges cover each day and recurrences preserve duration across short months", () => {
  const task = { startDate: "2026-01-20", dueDate: "2026-01-31" };
  assert.equal(taskOccursOn(task, "2026-01-19"), false);
  assert.equal(taskOccursOn(task, "2026-01-20"), true);
  assert.equal(taskOccursOn(task, "2026-01-25"), true);
  assert.equal(taskOccursOn(task, "2026-01-31"), true);
  assert.equal(taskOccursOn(task, "2026-02-01"), false);
  assert.equal(taskOccursOn({ dueDate: "2026-01-31" }, "2026-01-30"), false);
  assert.equal(taskOccursOn({ dueDate: null }, "2026-01-30"), false);
  assert.equal(shiftTaskStartDate(task, "2026-02-28"), "2026-02-17");
  assert.equal(
    shiftTaskStartDate(
      { startDate: "2026-12-31", dueDate: "2027-01-02" },
      "2027-01-09",
    ),
    "2027-01-07",
  );
  assert.equal(
    taskRangeError({ startDate: "2026-10-20", dueDate: "2026-10-20" }),
    null,
  );
});

test("demo updates validate the merged range and recurring tasks carry the range forward", () => {
  const data = createDemo();
  const command = commandSchema.parse({
    action: "createTask",
    task: {
      title: "Recurring range",
      startDate: "2026-01-20",
      dueDate: "2026-01-31",
      recurrence: "monthly",
    },
  });
  const created = demoCommand(data, command, false);
  const task = created.data.tasks[0];
  assert.throws(
    () =>
      demoCommand(
        created.data,
        {
          action: "updateTask",
          id: task.id,
          version: task.version,
          patch: { dueDate: "2026-01-19" },
        },
        false,
      ),
    /on or after/,
  );
  assert.throws(
    () =>
      demoCommand(
        created.data,
        {
          action: "updateTask",
          id: task.id,
          version: task.version,
          patch: { dueDate: null },
        },
        false,
      ),
    /end date/,
  );
  const completed = demoCommand(
    created.data,
    {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { status: "done" },
    },
    false,
  );
  const next = completed.data.tasks.find(
    (row) => row.recurrenceSourceId === task.id,
  )!;
  assert.equal(next.dueDate, "2026-02-28");
  assert.equal(next.startDate, "2026-02-17");
  const cleared = demoCommand(
    created.data,
    {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { startDate: null, dueDate: null, recurrence: null },
    },
    false,
  );
  assert.equal(
    cleared.data.tasks.find((row) => row.id === task.id)?.startDate,
    null,
  );
});

test("legacy receipt payloads remain byte-identical and imported/exported ranges round trip", () => {
  assert.equal(
    JSON.stringify(
      commandSchema.parse({ action: "createTask", task: { title: "Legacy" } }),
    ),
    '{"action":"createTask","task":{"title":"Legacy","description":"","projectId":null,"status":"todo","priority":"none","assignee":null,"dueDate":null,"labels":[],"checklist":[]}}',
  );
  const task = {
    ...createDemo().tasks[0],
    startDate: "2026-10-20",
    dueDate: "2026-10-23",
    assignee: null,
  };
  const result = previewCSV(csvExport([task]), [], []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tasks[0].startDate, task.startDate);
  assert.equal(result.tasks[0].dueDate, task.dueDate);
  assert.equal(
    commandSchema.safeParse({
      action: "createTask",
      task: {
        title: "Invalid",
        startDate: "0000-01-01",
        dueDate: "2026-10-23",
      },
    }).success,
    false,
  );
});

test("Calendar ranged timed events start at the first real minute across a midnight DST gap", () => {
  const event = calendarEventBody(
    {
      id,
      title: "DST range",
      startDate: "2018-11-04",
      dueDate: "2018-11-06",
      dueTime: "15:00",
      dueTimeZone: "America/Sao_Paulo",
    },
    "UTC",
    [15],
    "https://example.com",
  );
  assert.deepEqual(event.start, {
    dateTime: "2018-11-04T03:00:00.000Z",
    timeZone: "America/Sao_Paulo",
  });
  assert.deepEqual(event.end, {
    dateTime: "2018-11-06T17:00:00.000Z",
    timeZone: "America/Sao_Paulo",
  });
});
