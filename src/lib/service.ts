import { assertLockerCostReadOnly } from "./project-cost-authority";
import { connectedEnabled } from "./connected/transition";
import { deadlineInstant } from "./task-time";
import { taskRangeError, shiftTaskStartDate } from "./task-range";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { database, type Database } from "./db";
import * as s from "./db/schema";
import { AppError, requireAdmin } from "./permissions";
import { projectSummaries } from "./project-data";
import { workspaceConfigurationSchema } from "./preferences";
import type { ProjectExpense, SavedView } from "./project-model";
import { projectCostFields } from "./project-model";
import { workspaceStatistics } from "./task-query";
import { workspaceOnboardingUrl } from "./onboarding";
import { assertActorActive } from "./membership";
import { commandSchema, type Command } from "./validation";
import { createHash } from "node:crypto";
import {
  setDependencies,
  validateCompletion,
  validateTaskGraph,
  hydrateDependencies,
  nextRecurrenceDate,
} from "./planning";
import {
  DEFAULT_PREFERENCES,
  preferenceSchema,
  defaultProfile,
  workspaceFields,
} from "./preferences";
import type { AccountProfile, WorkspaceSettings } from "./preferences";
import {
  queueTaskSync,
  queueAllCalendarTasks,
  pauseCalendarJobs,
} from "./calendar/service";
import type {
  Actor,
  WorkspaceData,
  Task,
  Project,
  Member,
  Comment,
} from "./types";
export const PAGE_SIZE = 500;
function serialize<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export async function ensureAdminMember(actor: Actor) {
  if (actor.isAdmin) {
    const { db } = await database();
    await db
      .insert(s.member)
      .values({ email: actor.email, name: actor.name })
      .onConflictDoNothing();
  }
}
export async function loadWorkspace(actor: Actor): Promise<WorkspaceData> {
  const { db } = await database();
  await ensureAdminMember(actor);
  const [
    members,
    projects,
    tasks,
    notifications,
    activities,
    settingsRows,
    templates,
    savedViews,
  ] = await Promise.all([
    db.select().from(s.member).orderBy(asc(s.member.name)),
    projectSummaries(db),
    db
      .select()
      .from(s.task)
      .orderBy(asc(s.task.id))
      .limit(PAGE_SIZE + 1),
    db
      .select()
      .from(s.notification)
      .where(eq(s.notification.email, actor.email))
      .orderBy(desc(s.notification.createdAt))
      .limit(100),
    db.select().from(s.activity).orderBy(desc(s.activity.createdAt)).limit(100),
    db
      .select()
      .from(s.workspaceSetting)
      .where(eq(s.workspaceSetting.id, "primary")),
    db
      .select({
        id: s.taskTemplate.id,
        name: s.taskTemplate.name,
        ownerEmail: s.taskTemplate.ownerEmail,
        version: s.taskTemplate.version,
      })
      .from(s.taskTemplate)
      .where(eq(s.taskTemplate.archived, false))
      .orderBy(asc(s.taskTemplate.name)),
    db
      .select({
        id: s.savedView.id,
        name: s.savedView.name,
        filters: s.savedView.filters,
      })
      .from(s.savedView)
      .where(eq(s.savedView.ownerEmail, actor.email))
      .orderBy(asc(s.savedView.name)),
  ]);
  const settingsRow = settingsRows[0];
  const settings = {
    ...workspaceFields.parse({
      name: settingsRow.name,
      description: settingsRow.description,
      accent: settingsRow.accent,
      timeZone: settingsRow.timeZone,
      logoId: settingsRow.logoId,
      configuration: settingsRow.configuration,
    }),
    version: settingsRow.version,
  };
  const own = members.find((m) => m.email === actor.email);
  const profile: AccountProfile = own
    ? {
        name: own.name,
        jobTitle: own.jobTitle,
        bio: own.bio,
        timeZone: own.timeZone,
        avatarId: own.avatarId,
        preferences: preferenceSchema.parse({
          ...DEFAULT_PREFERENCES,
          ...own.preferences,
        }),
        version: own.version,
      }
    : defaultProfile(actor.name);
  const [stats, hydrated] = await Promise.all([
    workspaceStatistics(actor, profile.timeZone),
    hydrateDependencies(db, tasks.slice(0, PAGE_SIZE)),
  ]);
  return serialize({
    actor: {
      ...actor,
      name: profile.name,
      image: profile.avatarId
        ? `/api/attachments/${profile.avatarId}/content`
        : actor.image,
    },
    adminEmail: process.env.ADMIN_EMAIL!.toLowerCase(),
    savedViews,
    members: members.map((m) => ({
      email: m.email,
      name: m.name,
      color: m.color,
      disabled: m.disabled,
      jobTitle: m.jobTitle,
      bio: m.bio,
      timeZone: m.timeZone,
      avatarId: m.avatarId,
      version: m.version,
    })),
    projects,
    tasks: hydrated,
    notifications,
    activities,
    nextCursor: tasks.length > PAGE_SIZE ? tasks[PAGE_SIZE - 1].id : null,
    settings,
    profile,
    stats,
    templates,
    revision: settingsRow.revision,
    canonicalProjects: await connectedEnabled(db),
  });
}
export async function loadTaskPage(cursor: string) {
  const { db } = await database();
  const tasks = await db
    .select()
    .from(s.task)
    .where(gt(s.task.id, cursor))
    .orderBy(asc(s.task.id))
    .limit(PAGE_SIZE + 1);
  return serialize({
    tasks: await hydrateDependencies(db, tasks.slice(0, PAGE_SIZE)),
    nextCursor: tasks.length > PAGE_SIZE ? tasks[PAGE_SIZE - 1].id : null,
  });
}
export async function taskDiscussion(id: string) {
  const { db } = await database();
  if (
    !(
      await db.select({ id: s.task.id }).from(s.task).where(eq(s.task.id, id))
    )[0]
  )
    throw new AppError("Task not found.", 404);
  const [comments, activities] = await Promise.all([
    db
      .select()
      .from(s.comment)
      .where(eq(s.comment.taskId, id))
      .orderBy(desc(s.comment.createdAt))
      .limit(500),
    db
      .select()
      .from(s.activity)
      .where(eq(s.activity.taskId, id))
      .orderBy(desc(s.activity.createdAt))
      .limit(100),
  ]);
  return serialize({ comments: comments.reverse(), activities });
}
type CommandResult = {
  deletedTaskId?: string;
  deletedProjectId?: string;
  deletedActivityIds?: string[];
  expense?: ProjectExpense;
  savedView?: SavedView;
  deletedViewId?: string;
  task?: Task;
  tasks?: Task[];
  template?: {
    id: string;
    name: string;
    body: Record<string, unknown>;
    ownerEmail: string;
    version: number;
  };
  project?: Project;
  member?: Member;
  onboardingUrl?: string | null;
  comment?: Comment;
  ok?: boolean;
  profile?: AccountProfile;
  settings?: WorkspaceSettings;
  notification?: { id: string; read: boolean };
};
export async function executeCommand(
  actor: Actor,
  requestInput: unknown,
  connection?: Database,
): Promise<CommandResult> {
  const command = commandSchema.parse(requestInput);
  const db = connection ?? (await database()).db;
  const now = new Date();
  const [rate] = await db
    .insert(s.apiRate)
    .values({ key: actor.email, count: 1, resetAt: new Date(+now + 60000) })
    .onConflictDoUpdate({
      target: s.apiRate.key,
      set: {
        count: sql`CASE WHEN ${s.apiRate.resetAt} < ${now} THEN 1 ELSE ${s.apiRate.count}+1 END`,
        resetAt: sql`CASE WHEN ${s.apiRate.resetAt} < ${now} THEN ${new Date(+now + 60000)} ELSE ${s.apiRate.resetAt} END`,
      },
    })
    .returning();
  if (rate.count > 120)
    throw new AppError(
      "Too many changes. Please wait a minute and try again.",
      429,
    );
  return db.transaction(async (tx): Promise<CommandResult> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(48201603)`);
    await assertActorActive(tx, actor);
    if (["addExpense", "setExpenseVoided"].includes(command.action))
      throw new AppError(
        "Expense recording has been retired. Historical records are retained.",
        410,
      );
    const [policyRow] = await tx
      .select({
        configuration: s.workspaceSetting.configuration,
        timeZone: s.workspaceSetting.timeZone,
      })
      .from(s.workspaceSetting)
      .where(eq(s.workspaceSetting.id, "primary"));
    const policy = workspaceConfigurationSchema.parse(
      policyRow?.configuration || {},
    );
    if (
      policy.readOnly &&
      !actor.isAdmin &&
      [
        "createTask",
        "updateTask",
        "updateConnectionLabels",
        "bulkUpdateTasks",
        "importTasks",
      ].includes(command.action)
    )
      throw new AppError(
        "Task editing is paused for members. Contact your administrator.",
        403,
      );
    const canonicalProjects = await connectedEnabled(tx);
    if (
      canonicalProjects &&
      [
        "createProject",
        "updateProject",
        "deleteProject",
        "updateConnectionLabels",
        "addExpense",
        "updateExpense",
        "deleteExpense",
        "voidExpense",
        "createExpense",
        "setExpenseVoided",
      ].includes(command.action)
    )
      throw new AppError(
        "Manage shared projects and project costs in Board Room.",
        409,
      );
    const receiptId =
      "idempotencyKey" in command ? command.idempotencyKey : undefined;
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(command))
      .digest("hex");
    if (receiptId) {
      const [receipt] = await tx
        .select()
        .from(s.commandReceipt)
        .where(eq(s.commandReceipt.id, receiptId));
      if (receipt) {
        if (
          receipt.actorEmail !== actor.email ||
          receipt.payloadHash !== payloadHash
        )
          throw new AppError(
            "Identitas permintaan sudah digunakan untuk perubahan lain.",
            409,
          );
        const replay = { ...receipt.result } as CommandResult;
        const taskIds = [
          ...new Set([
            ...(replay.tasks || []).map((task) => task.id),
            ...(replay.task ? [replay.task.id] : []),
          ]),
        ];
        const currentTasks = taskIds.length
          ? await tx.select().from(s.task).where(inArray(s.task.id, taskIds))
          : [];
        if (currentTasks.length !== taskIds.length)
          throw new AppError(
            "A task saved by this request has since been deleted. Refresh the workspace before continuing.",
            409,
          );
        if (currentTasks.length) {
          const hydrated = await hydrateDependencies(tx, currentTasks);
          const byId = new Map(hydrated.map((task) => [task.id, task]));
          if (replay.task) replay.task = serialize(byId.get(replay.task.id)!);
          if (replay.tasks)
            replay.tasks = serialize(
              replay.tasks.map((task) => byId.get(task.id)!),
            );
        }
        if (replay.project) {
          const [project] = await projectSummaries(tx, replay.project.id);
          if (!project)
            throw new AppError(
              "The project saved by this request has since been deleted. Refresh the workspace before continuing.",
              409,
            );
          replay.project = serialize(project);
        }
        return replay;
      }
    }
    await tx
      .update(s.workspaceSetting)
      .set({ revision: sql`${s.workspaceSetting.revision}+1` })
      .where(eq(s.workspaceSetting.id, "primary"));
    if (process.env.DATABASE_URL)
      await tx.execute(sql`SELECT pg_notify('evolve_changed', 'refresh')`);
    const log = async (
      message: string,
      taskId: string | null = null,
      projectId: string | null = null,
      kind: string = taskId ? "task" : "general",
    ) => {
      await tx.insert(s.activity).values({
        id: crypto.randomUUID(),
        actor: actor.email,
        taskId,
        message,
        projectId,
        kind,
      });
    };
    const validateLinks = async (data: {
      projectId?: string | null;
      assignee?: string | null;
      parentId?: string | null;
      status?: string;
    }) => {
      if (
        data.projectId &&
        !(
          await tx
            .select()
            .from(s.project)
            .where(eq(s.project.id, data.projectId))
        )[0]
      )
        throw new AppError("Project no longer exists.", 400);
      if (
        data.assignee &&
        !(
          await tx
            .select()
            .from(s.member)
            .where(
              and(
                eq(s.member.email, data.assignee),
                eq(s.member.disabled, false),
              ),
            )
        )[0]
      )
        throw new AppError("Choose an active team member.", 400);
    };
    const notify = async (
      email: string | null | undefined,
      taskId: string,
      message: string,
    ) => {
      const recipient = email
        ? (await tx.select().from(s.member).where(eq(s.member.email, email)))[0]
        : undefined;
      const preferences = preferenceSchema.parse({
        ...DEFAULT_PREFERENCES,
        ...recipient?.preferences,
      });
      const enabled =
        command.action === "addComment"
          ? preferences.commentNotifications
          : preferences.assignmentNotifications;
      if (
        email &&
        email !== actor.email &&
        recipient &&
        !recipient.disabled &&
        enabled
      )
        await tx
          .insert(s.notification)
          .values({ id: crypto.randomUUID(), email, taskId, message });
    };
    const [creator] = await tx
      .select({ timeZone: s.member.timeZone })
      .from(s.member)
      .where(eq(s.member.email, actor.email));
    const creatorTimeZone = creator?.timeZone || "Asia/Jakarta";
    const validateDeadline = (
      date: string | null | undefined,
      time: string | null | undefined,
      zone: string,
    ) => {
      if (!date || !time) return;
      try {
        deadlineInstant(date, time, zone);
      } catch {
        throw new AppError(
          "Jam tenggat tidak tersedia pada tanggal dan zona waktu ini.",
          400,
        );
      }
    };
    type TaskCommand = Extract<
      Command,
      { action: "createTask" | "updateTask" }
    >;
    let deferTaskGraph = false;
    const enforceTaskGraph = async (id: string) => {
      await validateTaskGraph(tx, id);
      const [current] = await tx
        .select({ status: s.task.status })
        .from(s.task)
        .where(eq(s.task.id, id));
      if (current?.status === "done") await validateCompletion(tx, id);
      const boundaries = await tx.execute(
        sql`SELECT task_id AS id FROM task_dependency WHERE depends_on_id=${id} UNION SELECT parent_id AS id FROM task WHERE id=${id} AND parent_id IS NOT NULL`,
      );
      for (const b of boundaries.rows) {
        await validateTaskGraph(tx, String(b.id));
        const [current] = await tx
          .select({ status: s.task.status })
          .from(s.task)
          .where(eq(s.task.id, String(b.id)));
        if (current?.status === "done")
          await validateCompletion(tx, String(b.id));
      }
    };
    const changeTask = async (
      command: TaskCommand,
      recurrenceSourceId?: string,
      recurrenceAnchorDay?: number,
    ): Promise<CommandResult> => {
      switch (command.action) {
        case "createTask": {
          if (
            !canonicalProjects &&
            (command.task.parentId || command.task.dependencies?.length)
          )
            throw new AppError(
              "Task relationships are available after the canonical project transition.",
            );
          const rangeError = taskRangeError(command.task);
          if (rangeError) throw new AppError(rangeError, 400);
          if (
            canonicalProjects &&
            !command.task.projectId &&
            !command.task.parentId
          )
            throw new AppError("Choose a Board Room project.");
          if (canonicalProjects && command.task.parentId) {
            const [parent] = await tx
              .select()
              .from(s.task)
              .where(eq(s.task.id, command.task.parentId));
            if (!parent)
              throw new AppError("Parent task no longer exists.", 404);
            command.task.projectId = parent.projectId;
          }
          await validateLinks(command.task);
          if (command.task.dueTime && !command.task.dueDate)
            throw new AppError("Jam tenggat memerlukan tanggal.", 400);
          validateDeadline(
            command.task.dueDate,
            command.task.dueTime,
            command.task.dueTimeZone || creatorTimeZone,
          );
          const id = crypto.randomUUID();
          const { dependencies = [], ...taskData } = command.task;
          if (taskData.recurrence && !taskData.dueDate)
            throw new AppError(
              "Task berulang memerlukan tanggal tenggat.",
              400,
            );
          const [task] = await tx
            .insert(s.task)
            .values({
              ...taskData,
              dueTimeZone: taskData.dueTime
                ? taskData.dueTimeZone || creatorTimeZone
                : null,
              recurrenceSourceId: recurrenceSourceId || null,
              recurrenceAnchorDay: taskData.recurrence
                ? (recurrenceAnchorDay ??
                  Number(taskData.dueDate?.slice(8, 10)))
                : null,
              id,
              createdBy: actor.email,
              completedAt: command.task.status === "done" ? now : null,
            })
            .returning();
          if (command.attachmentIds?.length) {
            if (!command.idempotencyKey)
              throw new AppError(
                "A task draft is required for attachments.",
                400,
              );
            const claimed = await tx
              .update(s.attachment)
              .set({ entityType: "task", entityId: id })
              .where(
                and(
                  inArray(s.attachment.id, command.attachmentIds),
                  eq(s.attachment.entityType, "taskDraft"),
                  eq(s.attachment.entityId, command.idempotencyKey),
                  eq(s.attachment.ownerEmail, actor.email),
                  eq(s.attachment.state, "ready"),
                  gt(s.attachment.createdAt, new Date(Date.now() - 86400000)),
                ),
              )
              .returning({ id: s.attachment.id });
            if (claimed.length !== command.attachmentIds.length)
              throw new AppError(
                "An attachment is unavailable or expired. Remove it and upload it again before creating the task.",
                409,
              );
          }
          if (canonicalProjects) {
            await setDependencies(tx, id, dependencies);
            if (!deferTaskGraph) await enforceTaskGraph(id);
          }
          await log(`created “${task.title}”`, id);
          await queueTaskSync(tx, id);
          await notify(
            task.assignee,
            id,
            `${actor.name} assigned you “${task.title}”`,
          );
          void dependencies;
          const [result] = await hydrateDependencies(tx, [task]);
          return serialize({ task: result });
        }
        case "updateTask": {
          await validateLinks(command.patch);
          const [before] = await tx
            .select()
            .from(s.task)
            .where(eq(s.task.id, command.id));
          if (!before) throw new AppError("Task not found.", 404);
          if (
            !canonicalProjects &&
            (command.patch.parentId || command.patch.dependencies?.length)
          )
            throw new AppError(
              "Task relationships are available after the canonical project transition.",
            );
          const rangeError = taskRangeError({
            startDate:
              command.patch.startDate === undefined
                ? before.startDate
                : command.patch.startDate,
            dueDate:
              command.patch.dueDate === undefined
                ? before.dueDate
                : command.patch.dueDate,
          });
          if (rangeError) throw new AppError(rangeError, 400);
          if (command.patch.dueDate === null) command.patch.dueTime = null;
          if (
            command.patch.dueTime &&
            !(command.patch.dueDate ?? before.dueDate)
          )
            throw new AppError("Jam tenggat memerlukan tanggal.", 400);
          const { dependencies, ...patch } = command.patch;
          void dependencies;
          const dueTime =
            patch.dueTime === undefined ? before.dueTime : patch.dueTime;
          patch.dueTimeZone = dueTime
            ? patch.dueTimeZone || before.dueTimeZone || creatorTimeZone
            : null;
          const recurrence =
            patch.recurrence === undefined
              ? before.recurrence
              : patch.recurrence;
          const dueDate =
            patch.dueDate === undefined ? before.dueDate : patch.dueDate;
          if (recurrence && !dueDate)
            throw new AppError(
              "Task berulang memerlukan tanggal tenggat.",
              400,
            );
          validateDeadline(
            dueDate,
            dueTime,
            patch.dueTimeZone || creatorTimeZone,
          );
          const recurrenceAnchorDay = recurrence
            ? (patch.recurrence !== undefined &&
                patch.recurrence !== before.recurrence) ||
              (patch.dueDate !== undefined && patch.dueDate !== before.dueDate)
              ? Number(dueDate?.slice(8, 10))
              : (before.recurrenceAnchorDay ?? Number(dueDate?.slice(8, 10)))
            : null;
          const complete =
            command.patch.status !== undefined
              ? {
                  completedAt:
                    command.patch.status === "done"
                      ? before.completedAt || now
                      : null,
                }
              : {};
          const [task] = await tx
            .update(s.task)
            .set({
              ...patch,
              recurrenceAnchorDay,
              ...complete,
              version: sql`${s.task.version}+1`,
              updatedAt: now,
            })
            .where(
              and(
                eq(s.task.id, command.id),
                eq(s.task.version, command.version),
              ),
            )
            .returning();
          if (!task)
            throw new AppError(
              "This task changed while you were editing. Close and reopen it to review the latest version, then try again.",
              409,
            );
          if (task.recurrence && !task.dueDate)
            throw new AppError(
              "Task berulang memerlukan tanggal tenggat.",
              400,
            );
          if (canonicalProjects) {
            if (dependencies !== undefined)
              await setDependencies(tx, task.id, dependencies);
            if (!deferTaskGraph) await enforceTaskGraph(task.id);
          }
          const message =
            command.patch.archived !== undefined
              ? (command.patch.archived ? "archived" : "restored") +
                ` “${task.title}”`
              : command.patch.status && command.patch.status !== before.status
                ? `moved “${task.title}” to ${command.patch.status.replaceAll("_", " ")}`
                : `updated “${task.title}”`;
          await log(message, task.id);
          await queueTaskSync(tx, task.id);
          if (task.assignee !== before.assignee)
            await notify(
              task.assignee,
              task.id,
              `${actor.name} assigned you “${task.title}”`,
            );
          const [result] = await hydrateDependencies(tx, [task]);
          const tasks: Task[] = [];
          if (
            task.status === "done" &&
            before.status !== "done" &&
            task.recurrence &&
            task.dueDate
          ) {
            const [existing] = await tx
              .select()
              .from(s.task)
              .where(eq(s.task.recurrenceSourceId, task.id));
            if (!existing) {
              const [activeAssignee] = task.assignee
                ? await tx
                    .select({ email: s.member.email })
                    .from(s.member)
                    .where(
                      and(
                        eq(s.member.email, task.assignee),
                        eq(s.member.disabled, false),
                      ),
                    )
                : [];
              const nextDueDate = nextRecurrenceDate(
                task.dueDate,
                task.recurrence,
                task.recurrenceAnchorDay || undefined,
              );
              const next = await changeTask(
                {
                  action: "createTask",
                  task: {
                    title: task.title,
                    description: task.description,
                    projectId: task.projectId,
                    status: "todo",
                    priority: task.priority,
                    assignee: activeAssignee?.email || null,
                    ...(task.startDate
                      ? { startDate: shiftTaskStartDate(task, nextDueDate) }
                      : {}),
                    dueDate: nextDueDate,
                    dueTime: task.dueTime,
                    dueTimeZone: task.dueTimeZone,
                    labels: [],
                    checklist: task.checklist.map((item) => ({
                      ...item,
                      id: crypto.randomUUID(),
                      done: false,
                    })),
                    recurrence: task.recurrence,
                    parentId: null,
                    dependencies: [],
                  },
                },
                task.id,
                task.recurrenceAnchorDay || undefined,
              );
              tasks.push(next.task!);
            }
          }
          return serialize({
            task: result,
            ...(tasks.length ? { tasks: [result, ...tasks] } : {}),
          });
        }
      }
    };
    const result = await (async (): Promise<CommandResult> => {
      switch (command.action) {
        case "deleteTask": {
          requireAdmin(actor);
          const [before] = await tx
            .select()
            .from(s.task)
            .where(eq(s.task.id, command.id));
          if (!before) return { deletedTaskId: command.id, ok: true };
          if (before.version !== command.version)
            throw new AppError(
              "This task changed. Reopen it and review the latest version before deleting.",
              409,
            );
          // Queue before removal: the durable job retains the deterministic event ID.
          // An in-flight sync keeps its lease; a newer generation removes its result.
          await queueTaskSync(tx, before.id);
          await tx
            .update(s.attachment)
            .set({ state: "deleting" })
            .where(
              and(
                eq(s.attachment.entityType, "task"),
                eq(s.attachment.entityId, before.id),
              ),
            );
          await tx
            .delete(s.calendarTaskPreference)
            .where(eq(s.calendarTaskPreference.taskId, before.id));
          await tx
            .update(s.calendarOauthState)
            .set({ returnTaskId: null })
            .where(eq(s.calendarOauthState.returnTaskId, before.id));
          const related = await tx
            .update(s.task)
            .set({
              parentId: sql`CASE WHEN ${s.task.parentId}=${before.id} THEN NULL ELSE ${s.task.parentId} END`,
              recurrenceSourceId: sql`CASE WHEN ${s.task.recurrenceSourceId}=${before.id} THEN NULL ELSE ${s.task.recurrenceSourceId} END`,
              version: sql`${s.task.version}+1`,
              updatedAt: now,
            })
            .where(
              or(
                eq(s.task.parentId, before.id),
                eq(s.task.recurrenceSourceId, before.id),
                sql`${s.task.id} IN (SELECT task_id FROM task_dependency WHERE depends_on_id=${before.id})`,
              ),
            )
            .returning({ id: s.task.id });
          await queueTaskSync(
            tx,
            related.map((task) => task.id),
          );
          await tx
            .delete(s.taskDependency)
            .where(
              or(
                eq(s.taskDependency.taskId, before.id),
                eq(s.taskDependency.dependsOnId, before.id),
              ),
            );
          await tx.delete(s.task).where(eq(s.task.id, before.id));
          await log(
            `deleted “${before.title}”`,
            null,
            before.projectId,
            "task",
          );
          return { deletedTaskId: before.id, ok: true };
        }
        case "deleteProject": {
          requireAdmin(actor);
          const [before] = await tx
            .select()
            .from(s.project)
            .where(eq(s.project.id, command.id));
          if (!before) return { deletedProjectId: command.id, ok: true };
          if (before.version !== command.version)
            throw new AppError(
              "This project changed. Reopen it and review the latest version before deleting.",
              409,
            );
          // Preserve every task, including archived tasks beyond the loaded page.
          const detached = await tx
            .update(s.task)
            .set({
              projectId: null,
              version: sql`${s.task.version}+1`,
              updatedAt: now,
            })
            .where(eq(s.task.projectId, before.id))
            .returning({ id: s.task.id });
          await queueTaskSync(
            tx,
            detached.map((task) => task.id),
          );
          await tx
            .update(s.attachment)
            .set({ state: "deleting" })
            .where(
              and(
                eq(s.attachment.entityType, "project"),
                eq(s.attachment.entityId, before.id),
              ),
            );
          await tx
            .delete(s.projectExpense)
            .where(eq(s.projectExpense.projectId, before.id));
          await tx
            .update(s.activity)
            .set({ projectId: null })
            .where(eq(s.activity.projectId, before.id));
          await tx.delete(s.project).where(eq(s.project.id, before.id));
          await log(
            `deleted the ${before.name} project; tasks kept in No project`,
            null,
            null,
            "project",
          );
          return { deletedProjectId: before.id, ok: true };
        }
        case "deleteActivities": {
          requireAdmin(actor);
          const removed = await tx
            .delete(s.activity)
            .where(inArray(s.activity.id, command.ids))
            .returning({ id: s.activity.id });
          return {
            deletedActivityIds: removed.map((item) => item.id),
            ok: true,
          };
        }
        case "setLocale": {
          const [row] = await tx
            .update(s.member)
            .set({
              preferences: sql`jsonb_set(${s.member.preferences},'{locale}',${JSON.stringify(command.locale)}::jsonb)`,
            })
            .where(eq(s.member.email, actor.email))
            .returning();
          if (!row) throw new AppError("Member not found.", 404);
          return {
            profile: {
              name: row.name,
              jobTitle: row.jobTitle,
              bio: row.bio,
              timeZone: row.timeZone,
              avatarId: row.avatarId,
              version: row.version,
              preferences: preferenceSchema.parse({
                ...DEFAULT_PREFERENCES,
                ...row.preferences,
              }),
            },
          };
        }
        case "createTask":
        case "updateTask":
          return changeTask(command);
        case "bulkUpdateTasks": {
          const tasks: Task[] = [];
          let items = command.items;
          if (canonicalProjects) {
            const initial = await tx
              .select()
              .from(s.task)
              .where(
                inArray(
                  s.task.id,
                  items.map((i) => i.id),
                ),
              )
              .for("update");
            if (
              initial.length !== items.length ||
              items.some(
                (item) =>
                  initial.find((t) => t.id === item.id)?.version !==
                  item.version,
              )
            )
              throw new AppError(
                "Some tasks changed. Refresh before updating the selection.",
                409,
              );
            if (command.patch.projectId) {
              const ancestry = await tx.execute(
                sql`WITH RECURSIVE ancestors(origin,parent_id,depth) AS(SELECT id,parent_id,1 FROM task WHERE id IN (${sql.join(
                  items.map((i) => sql`${i.id}`),
                  sql`, `,
                )}) UNION ALL SELECT a.origin,t.parent_id,a.depth+1 FROM ancestors a JOIN task t ON t.id=a.parent_id WHERE a.depth<100) SELECT origin,max(depth)::int depth FROM ancestors GROUP BY origin`,
              );
              const depths = new Map(
                ancestry.rows.map((r) => [String(r.origin), Number(r.depth)]),
              );
              items = [...items].sort(
                (a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0),
              );
            }
            deferTaskGraph = true;
          }
          for (const original of items) {
            const item = canonicalProjects
              ? {
                  ...original,
                  version: (
                    await tx
                      .select({ version: s.task.version })
                      .from(s.task)
                      .where(eq(s.task.id, original.id))
                  )[0].version,
                }
              : original;
            const result = await changeTask({
              action: "updateTask",
              ...item,
              patch: command.patch,
            });
            tasks.push(...(result.tasks || [result.task!]));
          }
          if (canonicalProjects) {
            deferTaskGraph = false;
            for (const item of items) await enforceTaskGraph(item.id);
          }
          return { tasks: [...new Map(tasks.map((t) => [t.id, t])).values()] };
        }
        case "importTasks": {
          const tasks: Task[] = [];
          for (const task of command.tasks) {
            const result = await changeTask({ action: "createTask", task });
            tasks.push(result.task!);
          }
          return { tasks };
        }
        case "saveTemplate": {
          const count = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(s.taskTemplate)
            .where(eq(s.taskTemplate.archived, false));
          if (count[0].count >= 100)
            throw new AppError(
              "Maksimal 100 template aktif. Arsipkan template yang tidak digunakan.",
              409,
            );
          const [template] = await tx
            .insert(s.taskTemplate)
            .values({
              id: crypto.randomUUID(),
              name: command.name,
              ownerEmail: actor.email,
              body: command.body,
            })
            .returning();
          await log(`saved the ${template.name} task template`);
          return serialize({ template });
        }
        case "archiveTemplate": {
          const [template] = await tx
            .select()
            .from(s.taskTemplate)
            .where(eq(s.taskTemplate.id, command.id));
          if (!template) throw new AppError("Template tidak ditemukan.", 404);
          if (template.ownerEmail !== actor.email && !actor.isAdmin)
            throw new AppError(
              "Hanya pembuat atau admin yang dapat mengarsipkan template.",
              403,
            );
          const [updated] = await tx
            .update(s.taskTemplate)
            .set({ archived: true, version: sql`${s.taskTemplate.version}+1` })
            .where(
              and(
                eq(s.taskTemplate.id, command.id),
                eq(s.taskTemplate.version, command.version),
              ),
            )
            .returning();
          if (!updated) throw new AppError("Template telah berubah.", 409);
          return { ok: true };
        }
        case "createProject": {
          requireAdmin(actor);
          const { action: _, idempotencyKey: __, ...input } = command;
          assertLockerCostReadOnly(
            null,
            requestInput as Record<string, unknown>,
          );
          const fields = projectCostFields(input);
          void _;
          void __;
          if (
            fields.startDate &&
            fields.targetDate &&
            fields.targetDate < fields.startDate
          )
            throw new AppError(
              "Target date must be on or after the start date.",
              400,
            );
          await validateLinks({ assignee: fields.ownerEmail });
          const [project] = await tx
            .insert(s.project)
            .values({ id: crypto.randomUUID(), ...fields })
            .returning();
          await log(
            `created the ${project.name} project`,
            null,
            project.id,
            "project",
          );
          return serialize({
            project: { ...project, spent: "0.00", expenseCount: 0 },
          });
        }
        case "updateConnectionLabels": {
          if (command.kind === "task")
            throw new AppError(
              "Labels are managed on the project. Edit this task's project labels instead.",
              400,
            );
          requireAdmin(actor);
          const [before] = await tx
            .select({ id: s.project.id })
            .from(s.project)
            .where(eq(s.project.id, command.id));
          if (!before) throw new AppError("Project not found.", 404);
          const [updated] = await tx
            .update(s.project)
            .set({
              labels: command.labels,
              version: sql`${s.project.version}+1`,
            })
            .where(
              and(
                eq(s.project.id, command.id),
                eq(s.project.version, command.version),
              ),
            )
            .returning();
          if (!updated)
            throw new AppError(
              "These labels changed while you were editing. Reload the current labels before saving.",
              409,
            );
          await log(
            `updated connection labels for “${updated.name}”`,
            null,
            updated.id,
            "project",
          );
          const [project] = await projectSummaries(tx, updated.id);
          return serialize({ project });
        }
        case "updateProject": {
          requireAdmin(actor);
          const { action: _, id, version, ...input } = command;
          const fields = projectCostFields(input);
          void _;
          const [before] = await tx
            .select()
            .from(s.project)
            .where(eq(s.project.id, id));
          if (!before) throw new AppError("Project not found.", 404);
          assertLockerCostReadOnly(
            before,
            requestInput as Record<string, unknown>,
          );
          if (
            fields.startDate &&
            fields.targetDate &&
            fields.targetDate < fields.startDate
          )
            throw new AppError(
              "Target date must be on or after the start date.",
              400,
            );
          if (fields.ownerEmail !== before.ownerEmail)
            await validateLinks({ assignee: fields.ownerEmail });
          const [updated] = await tx
            .update(s.project)
            .set({
              ...fields,
              currency: before.currency,
              budget: before.budget,
              costItems: before.costItems,
              costOptions: before.costOptions,
              version: sql`${s.project.version}+1`,
            })
            .where(and(eq(s.project.id, id), eq(s.project.version, version)))
            .returning();
          if (!updated)
            throw new AppError(
              "Project settings changed. Reload before saving.",
              409,
            );
          await log(`updated the ${updated.name} project`, null, id, "project");
          const [project] = await projectSummaries(tx, id);
          return serialize({ project });
        }
        case "addExpense":
        case "setExpenseVoided":
          throw new AppError(
            "Expense recording has been retired. Historical records are retained.",
            410,
          );
        case "createSavedView": {
          const count = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(s.savedView)
            .where(eq(s.savedView.ownerEmail, actor.email));
          if (count[0].count >= 20)
            throw new AppError(
              "You can save up to 20 views. Remove an unused view first.",
              400,
            );
          const existing = await tx
            .select({ id: s.savedView.id })
            .from(s.savedView)
            .where(
              and(
                eq(s.savedView.ownerEmail, actor.email),
                eq(s.savedView.name, command.name),
              ),
            );
          if (existing.length)
            throw new AppError(
              "You already have a saved view with this name.",
              409,
            );
          const [savedView] = await tx
            .insert(s.savedView)
            .values({
              id: crypto.randomUUID(),
              ownerEmail: actor.email,
              name: command.name,
              filters: command.filters,
            })
            .returning();
          return serialize({ savedView });
        }
        case "deleteSavedView": {
          const deleted = await tx
            .delete(s.savedView)
            .where(
              and(
                eq(s.savedView.id, command.id),
                eq(s.savedView.ownerEmail, actor.email),
              ),
            )
            .returning({ id: s.savedView.id });
          if (!deleted.length) throw new AppError("Saved view not found.", 404);
          return { deletedViewId: command.id };
        }
        case "revokeMemberSessions": {
          requireAdmin(actor);
          if (command.email === actor.email)
            throw new AppError(
              "Use your own account's sign-out action to end this session.",
              400,
            );
          const users = await tx
            .select({ id: s.user.id })
            .from(s.user)
            .where(eq(s.user.email, command.email));
          for (const user of users)
            await tx.delete(s.session).where(eq(s.session.userId, user.id));
          await log(
            `signed out all devices for ${command.email}`,
            null,
            null,
            "member",
          );
          return { ok: true };
        }
        case "inviteMember": {
          requireAdmin(actor);
          const domain = command.email.split("@")[1];
          if (
            policy.allowedInviteDomains.length &&
            !policy.allowedInviteDomains.includes(domain) &&
            command.email !== process.env.ADMIN_EMAIL?.toLowerCase()
          )
            throw new AppError(
              "This email domain is not allowed by workspace invitation settings.",
              400,
            );
          const [member] = await tx
            .insert(s.member)
            .values({
              email: command.email,
              name: command.name,
              color: "blue",
              timeZone: policyRow?.timeZone || "Asia/Jakarta",
            })
            .onConflictDoUpdate({
              target: s.member.email,
              set: { name: command.name, disabled: false },
            })
            .returning();
          await log(
            `granted workspace access to ${member.email}`,
            null,
            null,
            "member",
          );
          return serialize({ member, onboardingUrl: workspaceOnboardingUrl() });
        }
        case "setMemberAccess": {
          requireAdmin(actor);
          if (command.email === actor.email)
            throw new AppError(
              "The administrator’s access cannot be removed.",
              400,
            );
          const [member] = await tx
            .update(s.member)
            .set({ disabled: command.disabled })
            .where(eq(s.member.email, command.email))
            .returning();
          if (!member) throw new AppError("Member not found.", 404);
          if (command.disabled) {
            await pauseCalendarJobs(tx, command.email);
            await tx
              .update(s.calendarConnection)
              .set({
                enabled: false,
                accessToken: "",
                refreshToken: "",
                expiresAt: new Date(),
                errorCode: null,
                version: sql`${s.calendarConnection.version}+1`,
              })
              .where(eq(s.calendarConnection.email, command.email));
            const ids = await tx
              .select({ id: s.user.id })
              .from(s.user)
              .where(eq(s.user.email, command.email));
            if (ids[0])
              await tx.delete(s.session).where(eq(s.session.userId, ids[0].id));
          }
          await log(
            `${command.disabled ? "revoked" : "restored"} workspace access for ${member.email}`,
          );
          return serialize({ member });
        }
        case "addComment": {
          const [task] = await tx
            .select()
            .from(s.task)
            .where(eq(s.task.id, command.taskId));
          if (!task) throw new AppError("Task not found.", 404);
          const [comment] = await tx
            .insert(s.comment)
            .values({
              id: crypto.randomUUID(),
              taskId: command.taskId,
              author: actor.email,
              body: command.body,
            })
            .returning();
          await log(`commented on “${task.title}”`, task.id, null, "task");
          await notify(
            task.assignee,
            task.id,
            `${actor.name} commented on “${task.title}”`,
          );
          return serialize({ comment });
        }
        case "readNotifications":
          await tx
            .update(s.notification)
            .set({ read: true })
            .where(eq(s.notification.email, actor.email));
          return { ok: true };
        case "readNotification": {
          const [notification] = await tx
            .update(s.notification)
            .set({ read: command.read })
            .where(
              and(
                eq(s.notification.id, command.id),
                eq(s.notification.email, actor.email),
              ),
            )
            .returning({ id: s.notification.id, read: s.notification.read });
          if (!notification)
            throw new AppError("Notifikasi tidak ditemukan.", 404);
          return { notification };
        }
        case "updateProfile": {
          if (command.avatarId) {
            const [image] = await tx
              .select()
              .from(s.attachment)
              .where(
                and(
                  eq(s.attachment.id, command.avatarId),
                  eq(s.attachment.entityType, "avatar"),
                  eq(s.attachment.entityId, actor.email),
                  eq(s.attachment.state, "ready"),
                ),
              )
              .for("update");
            if (!image)
              throw new AppError("Avatar tidak tersedia untuk akun ini.", 400);
          }
          const { action: _, version, ...fields } = command;
          void _;
          const [member] = await tx
            .update(s.member)
            .set({
              ...fields,
              preferences: sql`${JSON.stringify({ ...fields.preferences, locale: "en" })}::jsonb`,
              version: sql`${s.member.version}+1`,
            })
            .where(
              and(
                eq(s.member.email, actor.email),
                eq(s.member.version, version),
              ),
            )
            .returning();
          if (!member)
            throw new AppError(
              "Profil telah berubah. Muat ulang sebelum menyimpan.",
              409,
            );
          if (fields.timeZone !== creatorTimeZone)
            await queueAllCalendarTasks(tx, actor.email);
          await log("updated their profile");
          return serialize({
            member: {
              email: member.email,
              name: member.name,
              color: member.color,
              disabled: member.disabled,
              jobTitle: member.jobTitle,
              bio: member.bio,
              timeZone: member.timeZone,
              avatarId: member.avatarId,
              version: member.version,
            },
            profile: {
              ...fields,
              preferences: preferenceSchema.parse({
                ...DEFAULT_PREFERENCES,
                ...member.preferences,
              }),
              version: member.version,
            },
          });
        }
        case "updateWorkspace": {
          requireAdmin(actor);
          if (command.logoId) {
            const [image] = await tx
              .select()
              .from(s.attachment)
              .where(
                and(
                  eq(s.attachment.id, command.logoId),
                  eq(s.attachment.entityType, "workspace"),
                  eq(s.attachment.state, "ready"),
                ),
              )
              .for("update");
            if (!image)
              throw new AppError("Logo workspace tidak tersedia.", 400);
          }
          const { action: _, version, ...fields } = command;
          void _;
          const [settings] = await tx
            .update(s.workspaceSetting)
            .set({
              ...fields,
              configuration:
                typeof requestInput === "object" &&
                requestInput !== null &&
                "configuration" in requestInput
                  ? fields.configuration
                  : sql`${s.workspaceSetting.configuration}`,
              version: sql`${s.workspaceSetting.version}+1`,
            })
            .where(
              and(
                eq(s.workspaceSetting.id, "primary"),
                eq(s.workspaceSetting.version, version),
              ),
            )
            .returning();
          if (!settings)
            throw new AppError(
              "Pengaturan workspace telah berubah. Muat ulang sebelum menyimpan.",
              409,
            );
          if (
            !policy.calendarEnabled &&
            settings.configuration.calendarEnabled !== false
          ) {
            const connections = await tx
              .select({ email: s.calendarConnection.email })
              .from(s.calendarConnection)
              .where(eq(s.calendarConnection.enabled, true));
            for (const connection of connections)
              await queueAllCalendarTasks(tx, connection.email);
          }
          await log("updated workspace settings", null, null, "settings");
          return serialize({
            settings: {
              ...fields,
              configuration: workspaceConfigurationSchema.parse(
                settings.configuration,
              ),
              version: settings.version,
            },
          });
        }
        case "updateMember": {
          requireAdmin(actor);
          const [member] = await tx
            .update(s.member)
            .set({
              name: command.name,
              jobTitle: command.jobTitle,
              version: sql`${s.member.version}+1`,
            })
            .where(
              and(
                eq(s.member.email, command.email),
                eq(s.member.version, command.version),
              ),
            )
            .returning();
          if (!member)
            throw new AppError(
              "Anggota telah berubah. Muat ulang lalu coba lagi.",
              409,
            );
          await log(`updated the profile of ${member.email}`);
          return serialize({
            member: {
              email: member.email,
              name: member.name,
              color: member.color,
              disabled: member.disabled,
              jobTitle: member.jobTitle,
              bio: member.bio,
              timeZone: member.timeZone,
              avatarId: member.avatarId,
              version: member.version,
            },
          });
        }
      }
    })();
    if (receiptId)
      await tx.insert(s.commandReceipt).values({
        id: receiptId,
        actorEmail: actor.email,
        payloadHash,
        result: result as Record<string, unknown>,
      });
    return result;
  });
}
