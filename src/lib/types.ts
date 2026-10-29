export const STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Member = {
  email: string;
  name: string;
  color: string;
  disabled: boolean;
  jobTitle?: string;
  bio?: string;
  timeZone?: string;
  avatarId?: string | null;
  version?: number;
};
export type Actor = {
  email: string;
  name: string;
  image?: string | null;
  isAdmin: boolean;
};
export type Project = {
  plannedCodYear?: number | null;
  category?: import("./project-model").ProjectCategory | null;
  costOptions?: import("./project-model").ProjectCostOption[] | null;
  costItems?: import("./project-model").ProjectCostItem[] | null;
  spentByCurrency?: {
    currency: import("./project-model").Currency;
    amount: string;
  }[];
  labels?: string[];
  ownerEmail?: string | null;
  status?: "planned" | "active" | "on_hold" | "completed";
  startDate?: string | null;
  targetDate?: string | null;
  currency?: import("./project-model").Currency;
  budget?: string;
  reference?: string;
  location?: string;
  version?: number;
  spent?: string;
  expenseCount?: number;
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
};
export type Task = {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  status: Status;
  priority: Priority;
  assignee: string | null;
  startDate?: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  dueTimeZone?: string | null;
  parentId?: string | null;
  dependencies?: string[];
  recurrence?: "daily" | "weekly" | "monthly" | null;
  recurrenceSourceId?: string | null;
  recurrenceAnchorDay?: number | null;
  labels: string[];
  checklist: ChecklistItem[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archived: boolean;
};
export type Comment = {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
};
export type Activity = {
  projectId?: string | null;
  kind?: string;
  id: string;
  taskId: string | null;
  actor: string;
  message: string;
  createdAt: string;
};
export type Notification = {
  id: string;
  email: string;
  taskId: string | null;
  message: string;
  read: boolean;
  createdAt: string;
};
export type WorkspaceData = {
  canonicalProjects?: boolean;
  actor: Actor;
  adminEmail: string;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  notifications: Notification[];
  activities: Activity[];
  nextCursor: string | null;
  settings?: import("./preferences").WorkspaceSettings;
  profile?: import("./preferences").AccountProfile;
  revision?: number;
  templates?: {
    id: string;
    name: string;
    ownerEmail: string;
    body?: Record<string, unknown>;
    version: number;
  }[];
  expenses?: import("./project-model").ProjectExpense[];
  savedViews?: import("./project-model").SavedView[];
  stats?: WorkspaceStats;
};
export type WorkspaceStats = {
  archived?: number;
  total: number;
  completed: number;
  inMotion: number;
  dueThisWeek: number;
  myOpen: number;
  byProject: Record<
    string,
    {
      total: number;
      completed: number;
      open: number;
      overdue: number;
      assignees: string[];
    }
  >;
  byMember: Record<string, number>;
  completedByDay: Record<string, number>;
  focus: Task[];
};
