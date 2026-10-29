import {
  pgTable,
  numeric,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  bigint,
} from "drizzle-orm/pg-core";
import type { ChecklistItem, Priority, Status } from "../types";
import type {
  ProjectExpense,
  SavedView,
  Currency,
  ProjectCostItem,
  ProjectCostOption,
  ProjectCategory,
} from "../project-model";
import type { WorkspaceConfiguration } from "../preferences";
import type { AccountPreferences } from "../preferences";
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);
export const verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const member = pgTable("member", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("violet"),
  disabled: boolean("disabled").notNull().default(false),
  jobTitle: text("job_title").notNull().default(""),
  bio: text("bio").notNull().default(""),
  timeZone: text("time_zone").notNull().default("Asia/Jakarta"),
  avatarId: text("avatar_id"),
  preferences: jsonb("preferences")
    .$type<Partial<AccountPreferences>>()
    .notNull()
    .default({}),
  version: integer("version").notNull().default(1),
});
export const project = pgTable("project", {
  plannedCodYear: integer("planned_cod_year"),
  category: text("category").$type<ProjectCategory>(),
  costOptions: jsonb("cost_options").$type<ProjectCostOption[]>(),
  costItems: jsonb("cost_items").$type<ProjectCostItem[]>(),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  ownerEmail: text("owner_email").references(() => member.email),
  status: text("status")
    .$type<"planned" | "active" | "on_hold" | "completed">()
    .notNull()
    .default("active"),
  startDate: text("start_date"),
  targetDate: text("target_date"),
  currency: text("currency").$type<Currency>().notNull().default("IDR"),
  budget: numeric("budget").notNull().default("0.00"),
  reference: text("reference").notNull().default(""),
  location: text("location").notNull().default(""),
  version: integer("version").notNull().default(1),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("violet"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const task = pgTable(
  "task",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    projectId: text("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    status: text("status").$type<Status>().notNull().default("todo"),
    priority: text("priority").$type<Priority>().notNull().default("none"),
    assignee: text("assignee").references(() => member.email, {
      onDelete: "restrict",
    }),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    dueTime: text("due_time"),
    dueTimeZone: text("due_time_zone"),
    parentId: text("parent_id"),
    recurrence: text("recurrence").$type<
      "daily" | "weekly" | "monthly" | null
    >(),
    recurrenceSourceId: text("recurrence_source_id"),
    recurrenceAnchorDay: integer("recurrence_anchor_day"),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    checklist: jsonb("checklist")
      .$type<ChecklistItem[]>()
      .notNull()
      .default([]),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("task_project_status_idx").on(t.projectId, t.status),
    index("task_assignee_due_idx").on(t.assignee, t.dueDate),
    index("task_cursor_idx").on(t.id),
  ],
);
export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("comment_task_idx").on(t.taskId)],
);
export const activity = pgTable(
  "activity",
  {
    projectId: text("project_id").references(() => project.id),
    kind: text("kind").notNull().default("general"),
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => task.id, { onDelete: "set null" }),
    actor: text("actor").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    taskId: text("task_id").references(() => task.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notification_email_idx").on(t.email, t.createdAt)],
);
export const rateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const apiRate = pgTable("api_rate", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: timestamp("reset_at").notNull(),
});
export const workspaceSetting = pgTable("workspace_setting", {
  configuration: jsonb("configuration")
    .$type<Partial<WorkspaceConfiguration>>()
    .notNull()
    .default({}),
  id: text("id").primaryKey().default("primary"),
  name: text("name").notNull().default("Evolve"),
  description: text("description")
    .notNull()
    .default("Private organization workspace"),
  accent: text("accent").notNull().default("green"),
  timeZone: text("time_zone").notNull().default("Asia/Jakarta"),
  logoId: text("logo_id"),
  version: integer("version").notNull().default(1),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
});
export const attachment = pgTable("attachment", {
  documentId: text("document_id"),
  versionNumber: integer("version_number").notNull().default(1),
  isCurrent: boolean("is_current").notNull().default(true),
  replacesAttachmentId: text("replaces_attachment_id"),
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull().unique(),
  purpose: text("purpose"),
  state: text("state").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const calendarConnection = pgTable("calendar_connection", {
  email: text("email")
    .primaryKey()
    .references(() => member.email),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  calendarId: text("calendar_id").notNull(),
  timeZone: text("time_zone").notNull(),
  syncScope: text("sync_scope").notNull().default("assigned"),
  reminders: jsonb("reminders").$type<number[]>().notNull().default([1440, 30]),
  enabled: boolean("enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  errorCode: text("error_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const calendarOauthState = pgTable("calendar_oauth_state", {
  returnTaskId: text("return_task_id").references(() => task.id),
  hash: text("hash").primaryKey(),
  email: text("email")
    .notNull()
    .references(() => member.email),
  verifier: text("verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const calendarJob = pgTable("calendar_job", {
  email: text("email").notNull(),
  taskId: text("task_id").notNull(),
  generation: integer("generation").notNull().default(1),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  lastError: text("last_error"),
});
export const calendarEvent = pgTable("calendar_event", {
  email: text("email").notNull(),
  taskId: text("task_id").notNull(),
  eventId: text("event_id").notNull(),
  syncedVersion: integer("synced_version").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const taskDependency = pgTable("task_dependency", {
  taskId: text("task_id").notNull(),
  dependsOnId: text("depends_on_id").notNull(),
});
export const taskTemplate = pgTable("task_template", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  body: jsonb("body").$type<Record<string, unknown>>().notNull(),
  version: integer("version").notNull().default(1),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const commandReceipt = pgTable("command_receipt", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  payloadHash: text("payload_hash").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectExpense = pgTable("project_expense", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id),
  currency: text("currency").$type<Currency>().notNull(),
  amount: numeric("amount").notNull(),
  description: text("description").notNull(),
  category: text("category").$type<ProjectExpense["category"]>().notNull(),
  bookedOn: text("booked_on").notNull(),
  payee: text("payee").notNull().default(""),
  createdBy: text("created_by")
    .notNull()
    .references(() => member.email),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  voided: boolean("voided").notNull().default(false),
  version: integer("version").notNull().default(1),
});
export const savedView = pgTable("saved_view", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email")
    .notNull()
    .references(() => member.email),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<SavedView["filters"]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const calendarTaskPreference = pgTable("calendar_task_preference", {
  email: text("email")
    .notNull()
    .references(() => member.email),
  taskId: text("task_id")
    .notNull()
    .references(() => task.id),
  enabled: boolean("enabled").notNull(),
});

// Board Room is isolated from Locker Room project/task records.
export const boardRoomConfig = pgTable("board_room_config", {
  id: text("id").primaryKey(),
  stages: jsonb("stages").$type<string[]>().notNull(),
  version: integer("version").notNull().default(1),
  revision: integer("revision").notNull().default(0),
});
export const boardRoomProject = pgTable("board_room_project", {
  id: text("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  data: jsonb("data")
    .$type<import("../board-room/model").ProjectPayload>()
    .notNull(),
  version: integer("version").notNull().default(1),
  documentRevision: integer("document_revision").notNull().default(0),
  reviewedRevision: integer("reviewed_revision"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const boardRoomCategory = pgTable("board_room_category", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  version: integer("version").notNull().default(1),
});
export const boardRoomAssignment = pgTable("board_room_assignment", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => boardRoomProject.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => boardRoomCategory.id, { onDelete: "restrict" }),
});
export const boardRoomHistory = pgTable("board_room_history", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => boardRoomProject.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A single bounded operational record, separate from user workspace settings.
export const operationsState = pgTable("operations_state", {
  id: text("id").primaryKey().default("primary"),
  version: integer("version").notNull().default(1),
  data: jsonb("data")
    .$type<import("../operations-model").OperationsState>()
    .notNull()
    .default({ schemaVersion: 1 }),
});

export const boardSavedView = pgTable("board_saved_view", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email")
    .notNull()
    .references(() => member.email),
  name: text("name").notNull(),
  filters: jsonb("filters")
    .$type<import("../board-room/saved-views-model").BoardViewFilters>()
    .notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
