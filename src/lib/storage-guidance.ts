export function storageGuidance(bytes: number, limit: number) {
  if (
    !Number.isFinite(bytes) ||
    !Number.isFinite(limit) ||
    bytes < 0 ||
    limit <= 0
  )
    return { level: "unknown" as const, remaining: 0, percent: 0 };
  const percent = Math.min(100, Math.floor((bytes / limit) * 100));
  const level =
    bytes >= limit
      ? "full"
      : bytes / limit >= 0.95
        ? "critical"
        : bytes / limit >= 0.8
          ? "warning"
          : "normal";
  return { level, remaining: Math.max(0, limit - bytes), percent };
}
