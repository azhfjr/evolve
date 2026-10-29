import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, previewCSV } from "../src/lib/csv-import";
import { nextRecurrenceDate } from "../src/lib/recurrence";
import { deadlineInstant } from "../src/lib/task-time";
import {
  calendarEventBody,
  encryptCalendarToken,
  decryptCalendarToken,
  googleEventId,
} from "../src/lib/calendar/google";
import {
  initialTaskDraft,
  taskInputFromDraft,
  parseTaskDraft,
} from "../src/lib/task-composer";
import { validateFileHeader } from "../src/lib/attachments";

test("CSV supports BOM, quoted commas, escaped quotes, and multiline descriptions", () => {
  const result = previewCSV(
    '\ufeffJudul,Deskripsi,Label\r\n"Satu, dua","Baris 1\nBaris ""dua""",\r\n',
    [],
    [],
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.tasks[0].title, "Satu, dua");
  assert.equal(result.tasks[0].description, 'Baris 1\nBaris "dua"');
  assert.deepEqual(result.tasks[0].labels, []);
});
test("CSV rejects malformed quoting, oversized batches, duplicate headers, and reports invalid references per row", () => {
  assert.throws(() => parseCSV('Title\n"unfinished'));
  assert.throws(() => parseCSV("Title\n" + Array(101).fill("Task").join("\n")));
  assert.throws(() => previewCSV("Title,Judul\nA,B", [], []));
  const result = previewCSV(
    "Title,Assignee,Due date\nA,nobody@example.com,2026-10-12\nB,,2026-02-30\nC,,2026-10-12",
    [],
    [],
  );
  assert.deepEqual(
    result.errors.map((e) => e.row),
    [2, 3],
  );
  assert.equal(result.tasks.length, 1);
});
test("monthly recurrence retains the original day across short months and leap years", () => {
  const feb = nextRecurrenceDate("2028-01-31", "monthly", 31);
  assert.equal(feb, "2028-02-29");
  assert.equal(nextRecurrenceDate(feb, "monthly", 31), "2028-03-31");
  assert.equal(nextRecurrenceDate("2026-12-30", "weekly"), "2027-01-06");
});
test("task deadlines retain their instant across account time zones and resolve DST explicitly", () => {
  assert.equal(
    deadlineInstant("2026-10-16", "09:00", "Asia/Jakarta").toISOString(),
    "2026-10-16T02:00:00.000Z",
  );
  assert.throws(() =>
    deadlineInstant("2026-03-08", "02:30", "America/New_York"),
  );
  assert.equal(
    deadlineInstant("2026-11-01", "01:30", "America/New_York").toISOString(),
    "2026-11-01T05:30:00.000Z",
  );
  const event = calendarEventBody(
    {
      id: crypto.randomUUID(),
      title: "Deadline",
      dueDate: "2026-11-01",
      dueTime: "01:45",
      dueTimeZone: "America/New_York",
    },
    "Asia/Jakarta",
    [30],
    "https://evolve.example",
  );
  assert.equal(
    new Date(event.end.dateTime!).getTime() -
      new Date(event.start.dateTime!).getTime(),
    30 * 60000,
  );
  assert.equal(event.start.timeZone, "America/New_York");
  assert.deepEqual(event.reminders, {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 30 }],
  });
});
test("all-day Calendar events span one date and contain no task description or assignee data", () => {
  const event = calendarEventBody(
    {
      id: crypto.randomUUID(),
      title: "Close year",
      dueDate: "2026-12-31",
      dueTime: null,
    },
    "Asia/Jakarta",
    [30],
    "https://evolve.example",
  );
  assert.deepEqual(event.start, { date: "2026-12-31" });
  assert.deepEqual(event.end, { date: "2027-01-01" });
  assert.deepEqual(event.reminders, {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 30 }],
  });
  assert.match(event.description, /https:\/\/evolve.example\/app\?task=/);
});
test("Calendar tokens are authenticated, bound to the account, and never stored as plaintext", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET =
    "feature-tests-only-abcdefghijklmnopqrstuvwxyz0123456789";
  try {
    const encrypted = encryptCalendarToken("test-token-only", "a@example.com");
    assert.ok(!encrypted.includes("test-token-only"));
    assert.equal(
      decryptCalendarToken(encrypted, "a@example.com"),
      "test-token-only",
    );
    assert.throws(() => decryptCalendarToken(encrypted, "b@example.com"));
    const pieces = encrypted.split(".");
    pieces[3] = Buffer.from("tampered").toString("base64url");
    assert.throws(() =>
      decryptCalendarToken(pieces.join("."), "a@example.com"),
    );
    assert.equal(
      googleEventId("a@example.com", "task"),
      googleEventId("a@example.com", "task"),
    );
    assert.notEqual(
      googleEventId("a@example.com", "task"),
      googleEventId("b@example.com", "task"),
    );
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});
test("restored drafts keep stable request and pending checklist identities for safe retries", () => {
  const draft = initialTaskDraft(null, { dueTimeZone: "Asia/Makassar" });
  draft.title = "Retry safely";
  draft.pendingChecklist = "First item";
  const now = Date.now();
  const restored = parseTaskDraft(
    JSON.stringify({ savedAt: now, draft }),
    now,
  )!;
  assert.equal(restored.requestId, draft.requestId);
  assert.deepEqual(taskInputFromDraft(restored), taskInputFromDraft(draft));
  assert.equal(
    taskInputFromDraft(draft).checklist[0].id,
    draft.pendingChecklistId,
  );
});
test("attachment validation rejects executable/active text headers masquerading as documents", () => {
  assert.equal(
    validateFileHeader(Buffer.from("%PDF-1.7\n"), "application/pdf"),
    true,
  );
  assert.equal(
    validateFileHeader(Buffer.from("<script>alert(1)</script>"), "text/plain"),
    false,
  );
  assert.equal(
    validateFileHeader(Buffer.from("MZ executable"), "application/pdf"),
    false,
  );
  assert.equal(
    validateFileHeader(Buffer.from("ordinary notes"), "text/plain"),
    true,
  );
});
test("Google quota failures remain retryable instead of forcing a new OAuth consent", async () => {
  const { googleJson } = await import("../src/lib/calendar/google");
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
        { status: 403 },
      );
    await assert.rejects(
      googleJson("https://www.googleapis.com/calendar/v3/test"),
      { code: "rate_limited" },
    );
    globalThis.fetch = async () =>
      Response.json(
        { error: { errors: [{ reason: "accessNotConfigured" }] } },
        { status: 403 },
      );
    await assert.rejects(
      googleJson("https://www.googleapis.com/calendar/v3/test"),
      { code: "integration_not_ready" },
    );
  } finally {
    globalThis.fetch = previous;
  }
});
