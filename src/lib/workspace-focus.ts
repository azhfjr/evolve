/** A date-only key in the account timezone, matching Locker Room's due filters. */
export function focusDate(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type WorkspaceFocus = {
  today: string;
  timeZone: string;
  myOpen: number;
  overdue: number;
  dueToday: number;
  needsReview: number;
  noFiles: number;
  incomplete: number;
};

export function focusLinks(email: string) {
  const tasks = (filters: Record<string, string>) =>
    `/app?${new URLSearchParams({ section: "tasks", open: "true", ...filters })}`;
  return {
    myOpen: tasks({ assignee: email }),
    overdue: tasks({ dueBucket: "overdue" }),
    dueToday: tasks({ dueBucket: "today" }),
    needsReview: "/board-room?section=documents&validation=review",
    noFiles: "/board-room?section=documents&validation=none",
    incomplete: "/board-room?section=projects&attention=incomplete",
  };
}
