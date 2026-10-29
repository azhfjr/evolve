"use client";
import { displayLabel } from "@/lib/labels";
import { useI18n, currentTranslator } from "./i18n-provider";

import { useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Archive,
  CalendarDays,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Ellipsis,
  ListTodo,
  Plus,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  eachDayOfInterval,
  parseISO,
} from "date-fns";
import { toast } from "sonner";
import clsx from "clsx";
import { Avatar, Empty, PriorityIcon, StatusIcon } from "./ui";
import type { SharedProps } from "./workspace-types";
import type { Task, Status, Project } from "@/lib/types";
import { STATUSES, STATUS_LABEL, PRIORITY_LABEL } from "@/lib/types";
import { isOverdue } from "@/lib/utils";
import { taskOccursOn } from "@/lib/task-range";

function TaskDateRange({ task }: { task: Task }) {
  const { formatDate, dueDateLabel } = useI18n();
  if (!task.dueDate) return <>{dueDateLabel(null)}</>;
  if (!task.startDate || task.startDate === task.dueDate)
    return <>{dueDateLabel(task.dueDate)}</>;
  const startPattern =
    task.startDate.slice(0, 7) === task.dueDate.slice(0, 7)
      ? "d"
      : task.startDate.slice(0, 4) === task.dueDate.slice(0, 4)
        ? "d MMM"
        : "d MMM yyyy";
  return (
    <span
      className="task-date-range"
      aria-label={`${task.startDate} to ${task.dueDate}`}
    >
      <time dateTime={task.startDate}>
        {formatDate(parseISO(task.startDate), startPattern)}
      </time>
      <span aria-hidden="true">–</span>
      <time dateTime={task.dueDate}>
        {formatDate(parseISO(task.dueDate), "d MMM yyyy")}
      </time>
    </span>
  );
}
export async function changeStatus(
  props: Pick<SharedProps, "run">,
  task: Task,
  status: Status,
) {
  const t = currentTranslator();
  try {
    await props.run({
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { status },
    });
    if (status === "done") toast.success(t("One less thing. Nicely done."));
  } catch (e) {
    toast.error((e as Error).message);
  }
}
function TaskMenu({
  task,
  run,
  onArchiveChange,
  onDeleteTask,
}: {
  task: Task;
  run: SharedProps["run"];
  onArchiveChange?: SharedProps["onArchiveChange"];
  onDeleteTask?: SharedProps["onDeleteTask"];
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function duplicate() {
    setBusy(true);
    try {
      const suffix = ` (${t("copy")})`;
      await run({
        action: "createTask",
        task: {
          title: task.title.slice(0, 200 - suffix.length) + suffix,
          description: task.description,
          projectId: task.projectId,
          status: "todo",
          priority: task.priority,
          assignee: task.assignee,
          ...(task.startDate !== undefined
            ? { startDate: task.startDate }
            : {}),
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          dueTimeZone: task.dueTimeZone,
          labels: [],
          checklist: task.checklist.map((c) => ({
            ...c,
            id: crypto.randomUUID(),
            done: false,
          })),
        },
      });
      toast.success(t("Task duplicated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    try {
      const result = await run({
        action: "updateTask",
        id: task.id,
        version: task.version,
        patch: { archived: !task.archived },
      });
      if (result.task && onArchiveChange) onArchiveChange(result.task as Task);
      else
        toast.success(
          task.archived
            ? t("Task restored")
            : t("Task archived. Find it in Archive."),
        );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className="icon-button task-menu-button"
        disabled={busy}
        aria-label={t("Actions for {title}", { title: task.title })}
        data-task-actions={task.id}
      >
        <Ellipsis size={17} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown-menu" align="end" sideOffset={5}>
          <Dropdown.Label>{t("Move to")}</Dropdown.Label>
          {STATUSES.map((s) => (
            <Dropdown.Item
              key={s}
              onSelect={() => void changeStatus({ run }, task, s)}
            >
              <StatusIcon status={s} />
              {t(STATUS_LABEL[s])}
              {task.status === s && <Check size={13} />}
            </Dropdown.Item>
          ))}
          <Dropdown.Separator />
          <Dropdown.Item onSelect={() => void duplicate()}>
            <Copy size={14} />
            {t("Duplicate task")}
          </Dropdown.Item>
          <Dropdown.Item onSelect={() => void archive()}>
            <Archive size={14} />
            {task.archived ? t("Restore task") : t("Archive task")}
          </Dropdown.Item>
          {onDeleteTask && (
            <>
              <Dropdown.Separator />
              <Dropdown.Item
                className="entity-delete-trigger"
                onSelect={() => onDeleteTask(task)}
              >
                <Trash2 size={14} />
                Delete task
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
function RestoreTaskButton({
  task,
  run,
  onArchiveChange,
}: {
  task: Task;
  run: SharedProps["run"];
  onArchiveChange?: SharedProps["onArchiveChange"];
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button archive-restore"
      disabled={busy}
      aria-label={t("Restore {title}", { title: task.title })}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const result = await run({
            action: "updateTask",
            id: task.id,
            version: task.version,
            patch: { archived: false },
          });
          if (result.task) onArchiveChange?.(result.task as Task);
        } catch (e) {
          toast.error(t((e as Error).message));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ArchiveRestore size={16} />
      <span>{t("Restore")}</span>
    </button>
  );
}
function TaskProjectReference({
  project,
  projectId,
  className,
}: {
  project?: Project;
  projectId: Task["projectId"];
  className: string;
}) {
  const { t } = useI18n();
  return (
    <span className={className}>
      {project && (
        <i
          className={`project-dot color-${project.color}`}
          aria-hidden="true"
        />
      )}
      <span className="task-project-name">
        {project?.name ||
          (projectId ? t("Project unavailable") : t("No project"))}
      </span>
    </span>
  );
}

export function TaskList({ tasks, ...props }: SharedProps & { tasks: Task[] }) {
  const { t, formatDate } = useI18n();
  const [collapsed, setCollapsed] = useState<Status[]>([]);
  if (!tasks.length)
    return (
      <Empty
        icon={<CheckCheck size={27} />}
        title={
          props.archiveView
            ? t("No archived tasks")
            : t("A little breathing room")
        }
        description={
          props.archiveView
            ? t(
                "Archived tasks appear here. If you expected a task, clear your search and filters.",
              )
            : t(
                "No tasks match this view. Add a next step or adjust your filters.",
              )
        }
        action={
          props.archiveView ? undefined : (
            <button className="button secondary" onClick={props.newTask}>
              <Plus size={14} />
              {t("Add a task")}
            </button>
          )
        }
      />
    );
  return (
    <div
      className={clsx(
        "task-list task-reference-list",
        props.archiveView && "archive-task-list",
      )}
    >
      {STATUSES.map((status) => {
        const group = tasks.filter((t) => t.status === status);
        if (!group.length) return null;
        const folded = collapsed.includes(status);
        return (
          <section className="task-group" key={status}>
            <button
              className="task-group-heading"
              onClick={() =>
                setCollapsed(
                  folded
                    ? collapsed.filter((s) => s !== status)
                    : [...collapsed, status],
                )
              }
              aria-expanded={!folded}
            >
              <ChevronDown size={13} className={folded ? "rotated" : ""} />
              <StatusIcon status={status} />
              <strong>{t(STATUS_LABEL[status])}</strong>
              <span>{group.length}</span>
            </button>
            {!folded && (
              <>
                <div className="task-table-head">
                  <span>{t("Task name")}</span>
                  <span>{t("Project")}</span>
                  <span>{t("Schedule")}</span>
                  <span>{t("Priority")}</span>
                  <span>{t("Assignee")}</span>
                  <span />
                </div>
                {group.map((task) => {
                  const project = props.data.projects.find(
                    (p) => p.id === task.projectId,
                  );
                  const member = props.data.members.find(
                    (m) => m.email === task.assignee,
                  );
                  return (
                    <div
                      className={clsx(
                        "task-row",
                        task.status === "done" && "is-complete",
                      )}
                      key={task.id}
                    >
                      <div className="task-name-cell">
                        <button
                          className={clsx(
                            "completion-button",
                            task.status === "done" && "checked",
                          )}
                          aria-label={`${task.status === "done" ? t("Reopen") : t("Complete")} ${task.title}`}
                          onClick={() =>
                            void changeStatus(
                              props,
                              task,
                              task.status === "done" ? "todo" : "done",
                            )
                          }
                        >
                          {task.status === "done" ? (
                            <Check size={12} />
                          ) : (
                            <Circle size={17} />
                          )}
                        </button>
                        <button
                          className="task-name"
                          aria-label={task.title}
                          onClick={() => props.openTask(task)}
                        >
                          {task.title}
                          {task.checklist.length > 0 && (
                            <span className="inline-checklist">
                              <CheckSquare size={12} />
                              {task.checklist.filter((c) => c.done).length}/
                              {task.checklist.length}
                            </span>
                          )}
                        </button>
                      </div>
                      <TaskProjectReference
                        project={project}
                        projectId={task.projectId}
                        className="task-project"
                      />
                      <span
                        className={clsx(
                          "task-date",
                          isOverdue(task) && "overdue",
                          task.dueDate ===
                            formatDate(new Date(), "yyyy-MM-dd") &&
                            task.status !== "done" &&
                            "today",
                        )}
                      >
                        {task.dueDate ? (
                          <>
                            <CalendarDays size={13} />
                            <TaskDateRange task={task} />
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span className="task-priority">
                        <PriorityIcon priority={task.priority} />
                        <span>{t(PRIORITY_LABEL[task.priority])}</span>
                      </span>
                      <span className="task-assignee">
                        {member ? (
                          <>
                            <Avatar
                              small
                              name={member.name}
                              color={member.color}
                            />
                            <span className="task-assignee-name">
                              {member.name}
                            </span>
                          </>
                        ) : (
                          <span className="unassigned-avatar">—</span>
                        )}
                      </span>
                      <div className="task-row-actions">
                        {props.archiveView && (
                          <RestoreTaskButton
                            task={task}
                            run={props.run}
                            onArchiveChange={props.onArchiveChange}
                          />
                        )}
                        <TaskMenu
                          task={task}
                          run={props.run}
                          onArchiveChange={props.onArchiveChange}
                          onDeleteTask={
                            props.data.actor.isAdmin
                              ? props.onDeleteTask
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
export function TaskBoard({
  tasks,
  ...props
}: SharedProps & { tasks: Task[] }) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  async function drop(status: Status) {
    const task = tasks.find((t) => t.id === dragging);
    setDragging(null);
    setOver(null);
    if (task && task.status !== status) await changeStatus(props, task, status);
  }
  return (
    <div className="board-scroll">
      <div className="kanban-board task-reference-board">
        {STATUSES.map((status) => {
          const group = tasks.filter((t) => t.status === status);
          return (
            <section
              className={clsx("kanban-column", over === status && "drag-over")}
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDrop={(e) => {
                e.preventDefault();
                void drop(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setOver(null);
              }}
            >
              <div className="kanban-heading">
                <StatusIcon status={status} />
                <h3>{t(STATUS_LABEL[status])}</h3>
                <span>{group.length}</span>
                <button
                  className="icon-button"
                  aria-label={t("Add task in {status}", {
                    status: t(STATUS_LABEL[status]),
                  })}
                  onClick={() =>
                    props.newTaskForStatus
                      ? props.newTaskForStatus(status)
                      : props.newTask()
                  }
                >
                  <Plus size={15} />
                </button>
              </div>
              <div className="kanban-cards">
                {group.map((task) => {
                  const project = props.data.projects.find(
                    (p) => p.id === task.projectId,
                  );
                  const m = props.data.members.find(
                    (m) => m.email === task.assignee,
                  );
                  return (
                    <article
                      draggable
                      key={task.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", task.id);
                        setDragging(task.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      className={clsx(
                        "kanban-card",
                        dragging === task.id && "dragging",
                      )}
                    >
                      <div className="kanban-card-top">
                        <TaskProjectReference
                          project={project}
                          projectId={task.projectId}
                          className="project-tag"
                        />
                        <TaskMenu
                          task={task}
                          run={props.run}
                          onArchiveChange={props.onArchiveChange}
                          onDeleteTask={
                            props.data.actor.isAdmin
                              ? props.onDeleteTask
                              : undefined
                          }
                        />
                      </div>
                      <button
                        className="kanban-task-name"
                        onClick={() => props.openTask(task)}
                      >
                        {task.title}
                      </button>
                      {task.labels.length > 0 && (
                        <div className="task-labels">
                          {task.labels.slice(0, 3).map((label) => (
                            <span key={label}>{displayLabel(label)}</span>
                          ))}
                        </div>
                      )}
                      {task.checklist.length > 0 && (
                        <div className="card-checklist">
                          <span>
                            <CheckSquare size={12} />
                            {task.checklist.filter((c) => c.done).length}/
                            {task.checklist.length}
                          </span>
                          <i>
                            <b
                              style={{
                                width: `${(task.checklist.filter((c) => c.done).length / task.checklist.length) * 100}%`,
                              }}
                            />
                          </i>
                        </div>
                      )}
                      <footer>
                        <span
                          className="card-priority"
                          title={t(PRIORITY_LABEL[task.priority])}
                        >
                          <PriorityIcon priority={task.priority} />
                        </span>
                        {task.dueDate && (
                          <span
                            className={clsx(
                              "card-due",
                              isOverdue(task) && "overdue",
                            )}
                          >
                            <CalendarDays size={12} />
                            <TaskDateRange task={task} />
                          </span>
                        )}
                        {m && <Avatar small name={m.name} color={m.color} />}
                      </footer>
                    </article>
                  );
                })}
                <button
                  className="board-add"
                  onClick={() =>
                    props.newTaskForStatus
                      ? props.newTaskForStatus(status)
                      : props.newTask()
                  }
                >
                  <Plus size={14} />
                  {t("Add task")}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
// Treat calendar dates as local wall dates after resolving the account's zone.
// This keeps date-fns month/day arithmetic independent of the browser's zone.
export function calendarToday(timeZone: string, instant = new Date()) {
  return parseISO(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant),
  );
}

export function TaskCalendar({
  tasks,
  ...props
}: SharedProps & { tasks: Task[] }) {
  const { t, formatDate } = useI18n();
  const timeZone =
    props.data.profile?.timeZone ||
    props.data.settings?.timeZone ||
    "Asia/Jakarta";
  const today = calendarToday(timeZone);
  const [internalMonth, setInternalMonth] = useState(() => today);
  const [internalSelectedDate, setInternalSelectedDate] = useState(() => today);
  const selectedDate = props.calendarSelectedDate || internalSelectedDate;
  const setSelectedDate = props.onCalendarDateChange || setInternalSelectedDate;
  const month = props.calendarMonth || internalMonth;
  const setMonth = props.onCalendarMonthChange || setInternalMonth;
  const dates = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const selectedDay = isSameMonth(selectedDate, month)
    ? selectedDate
    : startOfMonth(month);
  const selectedKey = formatDate(selectedDay, "yyyy-MM-dd");
  const selectedTasks = tasks.filter((task) => taskOccursOn(task, selectedKey));
  function moveMonth(next: Date) {
    setMonth(next);
    setSelectedDate(next);
  }
  const workingDays = props.data.settings?.configuration?.workingDays || [
    1, 2, 3, 4, 5,
  ];
  return (
    <div className="calendar-view">
      <header className="calendar-toolbar">
        <h2>{formatDate(month, "MMMM yyyy")}</h2>
        <div>
          <button
            className="button secondary small-button"
            onClick={() => moveMonth(today)}
          >
            {t("Today")}
          </button>
          <button
            className="icon-button"
            aria-label={t("Previous month")}
            onClick={() => moveMonth(addMonths(month, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Next month")}
            onClick={() => moveMonth(addMonths(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div className="calendar-grid">
        <div className="calendar-weekdays">
          {[
            t("Mon"),
            t("Tue"),
            t("Wed"),
            t("Thu"),
            t("Fri"),
            t("Sat"),
            t("Sun"),
          ].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-days">
          {dates.map((day) => {
            const dayKey = formatDate(day, "yyyy-MM-dd");
            const dayTasks = tasks.filter((task) => taskOccursOn(task, dayKey));
            return (
              <div
                className={clsx(
                  "calendar-day",
                  !isSameMonth(day, month) && "other-month",
                  !workingDays.includes(day.getDay()) && "non-working-day",
                  isSameDay(day, selectedDay) && "selected-day",
                )}
                key={day.toISOString()}
              >
                <div className="calendar-date-heading">
                  <button
                    type="button"
                    className="calendar-date-select"
                    aria-label={formatDate(day, "EEEE, MMMM d, yyyy")}
                    aria-pressed={isSameDay(day, selectedDay)}
                    aria-current={isSameDay(day, today) ? "date" : undefined}
                    onClick={() => {
                      setSelectedDate(day);
                      if (!isSameMonth(day, month)) setMonth(day);
                    }}
                  >
                    <time
                      className={isSameDay(day, today) ? "calendar-today" : ""}
                      dateTime={formatDate(day, "yyyy-MM-dd")}
                    >
                      {formatDate(day, "d")}
                    </time>
                    <span className="calendar-day-count">
                      {dayTasks.length ? dayTasks.length : ""}
                    </span>
                  </button>
                  {props.newTaskForDate && (
                    <button
                      type="button"
                      aria-label={t("Add task for {date}", {
                        date: formatDate(day, "EEEE, MMMM d, yyyy"),
                      })}
                      onClick={() =>
                        props.newTaskForDate?.(formatDate(day, "yyyy-MM-dd"))
                      }
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                {dayTasks.slice(0, 4).map((t) => {
                  const p = props.data.projects.find(
                    (p) => p.id === t.projectId,
                  );
                  return (
                    <button
                      className={clsx(
                        "calendar-task",
                        `color-${p?.color || "violet"}`,
                        t.startDate &&
                          t.startDate !== t.dueDate &&
                          "calendar-task-range",
                      )}
                      data-range-position={
                        !t.startDate || t.startDate === t.dueDate
                          ? "single"
                          : t.startDate === dayKey
                            ? "start"
                            : t.dueDate === dayKey
                              ? "end"
                              : "middle"
                      }
                      key={t.id}
                      onClick={() => props.openTask(t)}
                      title={
                        t.startDate
                          ? `${t.title} · ${t.startDate} – ${t.dueDate}`
                          : t.title
                      }
                    >
                      {t.status === "done" ? <Check size={10} /> : <span />}
                      {t.title}
                    </button>
                  );
                })}
                {dayTasks.length > 4 && (
                  <Dropdown.Root>
                    <Dropdown.Trigger className="calendar-more">
                      {t("+{count} more", { count: dayTasks.length - 4 })}
                    </Dropdown.Trigger>
                    <Dropdown.Portal>
                      <Dropdown.Content className="dropdown-menu">
                        {dayTasks.slice(4).map((t) => (
                          <Dropdown.Item
                            key={t.id}
                            onSelect={() => props.openTask(t)}
                          >
                            {t.title}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Content>
                    </Dropdown.Portal>
                  </Dropdown.Root>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <section
        className="calendar-agenda"
        aria-labelledby="calendar-agenda-title"
      >
        <header>
          <h3 id="calendar-agenda-title">
            {formatDate(selectedDay, "EEEE, MMMM d")}
          </h3>
          {props.newTaskForDate && (
            <button
              className="button secondary small-button"
              onClick={() => props.newTaskForDate?.(selectedKey)}
              aria-label={t("Add task for {date}", {
                date: formatDate(selectedDay, "EEEE, MMMM d, yyyy"),
              })}
            >
              <Plus size={14} /> {t("Add task")}
            </button>
          )}
        </header>
        {selectedTasks.length ? (
          <ul>
            {selectedTasks.map((task) => (
              <li key={task.id}>
                <button
                  aria-label={task.title}
                  onClick={() => props.openTask(task)}
                >
                  <StatusIcon status={task.status} />
                  <span>
                    {task.title}
                    {task.startDate && task.startDate !== task.dueDate && (
                      <small className="calendar-agenda-range">
                        <TaskDateRange task={task} />
                      </small>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("No tasks scheduled for this day.")}</p>
        )}
      </section>
      <div className="calendar-unscheduled">
        <ListTodo size={15} />
        <span>No due date yet?</span>
        <p>
          Undated tasks stay in List and Board. Shaded days are outside your
          workspace’s working week.
        </p>
      </div>
    </div>
  );
}
export function MiniFocus({
  tasks,
  ...props
}: SharedProps & { tasks: Task[] }) {
  const { t } = useI18n();
  return (
    <div className="focus-list">
      {tasks.length === 0 ? (
        <Empty
          icon={<CheckCheck size={24} />}
          title={t("You’re all caught up")}
          description={t("Take a breath, or choose your next step.")}
          action={
            <button className="text-link" onClick={props.newTask}>
              {t("Create a task")}
            </button>
          }
        />
      ) : (
        tasks.slice(0, 5).map((task) => {
          const project = props.data.projects.find(
            (p) => p.id === task.projectId,
          );
          const m = props.data.members.find((m) => m.email === task.assignee);
          return (
            <div className="focus-row" key={task.id}>
              <button
                className="completion-button"
                aria-label={t("Complete {title}", { title: task.title })}
                onClick={() => void changeStatus(props, task, "done")}
              >
                <Circle size={18} />
              </button>
              <button
                className="focus-task"
                onClick={() => props.openTask(task)}
              >
                <strong>{task.title}</strong>
                <span>
                  <i
                    className={`project-dot color-${project?.color || "violet"}`}
                  />
                  {project?.name || t("No project")}
                </span>
              </button>
              <PriorityIcon priority={task.priority} />
              <span className={clsx("focus-due", isOverdue(task) && "overdue")}>
                <TaskDateRange task={task} />
              </span>
              {m && <Avatar small name={m.name} color={m.color} />}
            </div>
          );
        })
      )}
    </div>
  );
}
// Keep date-only task fields independent of timezone conversion.
export const nextWeekDate = () =>
  format(addDays(parseISO(format(new Date(), "yyyy-MM-dd")), 7), "yyyy-MM-dd");
