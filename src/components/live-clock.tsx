"use client";
import { useSyncExternalStore } from "react";
import { Clock3 } from "lucide-react";
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer)
    timer = setInterval(
      () => listeners.forEach((callback) => callback()),
      1000,
    );
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const snapshot = () => Math.floor(Date.now() / 1000);
const serverSnapshot = () => null;
const formats = new Map<
  string,
  { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat }
>();
function formatters(timeZone: string) {
  let value = formats.get(timeZone);
  if (!value) {
    value = {
      date: new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }),
    };
    formats.set(timeZone, value);
  }
  return value;
}
export function LiveClock({
  timeZone = "Asia/Jakarta",
  variant = "header",
}: {
  timeZone?: string;
  variant?: "header" | "dashboard";
}) {
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const date = now ? new Date(now * 1000) : null;
  const format = formatters(timeZone);
  return (
    <div
      className={`live-clock live-clock-${variant}`}
      title={timeZone}
      aria-label={`Current date and time in ${timeZone}`}
    >
      <Clock3 size={16} aria-hidden="true" />
      <div>
        <span>{date ? format.date.format(date) : "Local date"}</span>
        <time dateTime={date?.toISOString()} suppressHydrationWarning>
          {date ? format.time.format(date) : "—"}
        </time>
      </div>
      {variant === "dashboard" && <small>{timeZone}</small>}
    </div>
  );
}
