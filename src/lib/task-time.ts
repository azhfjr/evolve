// Resolve a wall-clock deadline to one instant. During a repeated DST hour,
// use its first occurrence; reject times skipped by a clock change.
export function deadlineInstant(date: string, time: string, zone: string) {
  const target = `${date}T${time}:00`;
  const naive = Date.parse(`${target}Z`);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const wall = (instant: number) => {
    const p = Object.fromEntries(
      format.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  };
  const offsets = new Set(
    [-86400000, 0, 86400000].map((delta) => {
      const instant = naive + delta;
      return Date.parse(`${wall(instant)}Z`) - instant;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => wall(instant) === target);
  if (!candidates.length)
    throw new Error(
      "Jam tenggat tidak tersedia pada tanggal dan zona waktu ini.",
    );
  return new Date(Math.min(...candidates));
}
