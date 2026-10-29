import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import type { Task } from "../types";
import { deadlineInstant } from "../task-time";
import { taskRangeError } from "../task-range";
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export class CalendarError extends Error {
  constructor(
    public code:
      | "reconnect_required"
      | "temporarily_unavailable"
      | "rate_limited"
      | "integration_not_ready",
  ) {
    super(code);
  }
}
function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new CalendarError("integration_not_ready");
  return hkdfSync("sha256", secret, "evolve-calendar", "oauth-v1", 32);
}
export function encryptCalendarToken(value: string, email: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(email));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptCalendarToken(value: string, email: string) {
  try {
    const [version, iv, tag, payload] = value.split(".");
    if (version !== "v1") throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(email));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CalendarError("reconnect_required");
  }
}
export function googleEventId(email: string, taskId: string) {
  return "e" + createHash("sha256").update(`${email}:${taskId}`).digest("hex");
}
function calendarRangeStart(date: string, timeZone: string) {
  // A few zones advance their clock at midnight. Start at the first real local
  // minute of that calendar day instead of rejecting an otherwise valid range.
  for (let minute = 0; minute < 1440; minute++) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    try {
      return deadlineInstant(date, time, timeZone);
    } catch {}
  }
  throw new Error("TaskStartDateUnavailableInTimeZone");
}
export function calendarEventBody(
  task: Pick<
    Task,
    "id" | "title" | "startDate" | "dueDate" | "dueTime" | "dueTimeZone"
  >,
  timeZone: string,
  reminders: number[],
  origin: string,
) {
  timeZone = task.dueTimeZone || timeZone;
  const common = {
    summary: task.title,
    description: `Evolve task\n${new URL(`/app?task=${task.id}`, origin).toString()}`,
    extendedProperties: { private: { evolveTaskId: task.id } },
    reminders: {
      useDefault: false,
      overrides: reminders.map((minutes) => ({ method: "popup", minutes })),
    },
  };
  if (!task.dueDate) throw new Error("TaskDateRequired");
  if (taskRangeError(task)) throw new Error("TaskRangeInvalid");
  if (task.dueTime) {
    const deadline = deadlineInstant(task.dueDate, task.dueTime, timeZone);
    const multiDay = task.startDate && task.startDate < task.dueDate;
    const start = multiDay
      ? calendarRangeStart(task.startDate!, timeZone)
      : deadline;
    const end = multiDay ? deadline : new Date(+deadline + 30 * 60000);
    return {
      ...common,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
    };
  }
  const end = new Date(`${task.dueDate}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    ...common,
    start: { date: task.startDate || task.dueDate },
    end: { date: end.toISOString().slice(0, 10) },
  };
}
export async function googleJson(
  url: string,
  options: RequestInit = {},
  allowed: number[] = [],
): Promise<{ status: number; data: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new CalendarError("temporarily_unavailable");
  }
  if (allowed.includes(response.status))
    return { status: response.status, data: {} };
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const error =
      typeof data.error === "object" && data.error !== null
        ? (data.error as { errors?: { reason?: string }[] })
        : null;
    const reasons = error?.errors?.map((item) => item.reason) || [];
    if (
      response.status === 429 ||
      reasons.some((reason) =>
        [
          "rateLimitExceeded",
          "userRateLimitExceeded",
          "dailyLimitExceeded",
        ].includes(reason || ""),
      )
    )
      throw new CalendarError("rate_limited");
    if (reasons.includes("accessNotConfigured"))
      throw new CalendarError("integration_not_ready");
    if (
      response.status === 401 ||
      response.status === 403 ||
      data.error === "invalid_grant"
    )
      throw new CalendarError("reconnect_required");
    throw new CalendarError("temporarily_unavailable");
  }
  return { status: response.status, data };
}
