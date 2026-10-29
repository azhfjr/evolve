export function nextRecurrenceDate(
  date: string,
  pattern: "daily" | "weekly" | "monthly",
  anchorDay?: number,
) {
  const result = new Date(`${date}T12:00:00Z`);
  if (pattern === "monthly") {
    const day = anchorDay ?? result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    const end = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, end));
  } else
    result.setUTCDate(result.getUTCDate() + (pattern === "weekly" ? 7 : 1));
  return result.toISOString().slice(0, 10);
}
