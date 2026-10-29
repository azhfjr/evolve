"use client";
import { ConnectionOverview } from "./connections";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CheckCheck,
  Clock3,
  ListTodo,
  Plus,
  Users,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DashboardReport } from "@/lib/workspace-reports";
import { demoDashboard, type TaskDrilldown } from "@/lib/dashboard-model";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/types";
import type { SharedProps } from "./workspace-types";
import { Spinner } from "./ui";
import { ScheduleChart, SnapshotBars, StatusDonut } from "./overview-charts";
export function Dashboard({
  onProject,
  onFilter,
  onCreateProject,
  onExploreConnections,
  ...props
}: SharedProps & {
  onProject: (id: string) => void;
  onFilter: (filters: TaskDrilldown) => void;
  onCreateProject: () => void;
  onExploreConnections: (label?: string) => void;
}) {
  const days = 30;
  const [remote, setRemote] = useState<{
    report: DashboardReport;
    revision: number | undefined;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const demoReport = useMemo(
    () => (props.demo ? demoDashboard(props.data, days) : null),
    [props.demo, props.data, days],
  );
  useEffect(() => {
    if (props.demo) return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/dashboard?days=${days}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Overview could not be loaded.");
        return body as DashboardReport;
      })
      .then((report) => {
        if (active) {
          setRemote({ report, revision: props.data.revision });
          setError("");
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Overview could not be loaded.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [props.demo, props.data.revision, days, retry]);
  const report =
    demoReport ||
    (remote?.report.days === days && remote.revision === props.data.revision
      ? remote.report
      : null);
  const loading = !report && !error;
  const ratio = report?.totals.total
    ? Math.round((report.totals.completed / report.totals.total) * 100)
    : 0;
  const placeholder = (
    <div className="chart-placeholder" role="status">
      {loading ? (
        <>
          <Spinner />
          Loading overview…
        </>
      ) : (
        "Overview data is unavailable. Try again above."
      )}
    </div>
  );
  const metrics = [
    {
      label: "Open work",
      value: report?.totals.open,
      icon: ListTodo,
      detail: "Active tasks still to finish",
      filter: { open: true },
    },
    {
      label: "Completed",
      value: report?.totals.completed,
      icon: CheckCheck,
      detail: `${ratio}% of active tasks`,
      filter: { status: "done" },
    },
    {
      label: "Past due",
      value: report?.totals.overdue,
      icon: Clock3,
      detail: "Open tasks before today",
      filter: { dueBucket: "overdue", open: true },
    },
    {
      label: "Needs an owner",
      value: report?.totals.unassigned,
      icon: Users,
      detail: "Open and unassigned",
      filter: { assignee: "unassigned", open: true },
    },
  ];
  return (
    <div className="dashboard-page overview-dashboard">
      <div className="dashboard-section-heading overview-heading">
        <div>
          <span className="section-kicker">WORKSPACE OVERVIEW</span>
          <h2>Work in focus</h2>
          <p>
            Current snapshots across all active tasks. Archived tasks are
            excluded.
          </p>
        </div>
        {props.data.actor.isAdmin && (
          <button className="button secondary" onClick={onCreateProject}>
            <Plus size={16} />
            Create project
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}
      <div className="dashboard-metrics" aria-busy={loading}>
        {metrics.map((metric) => (
          <button
            className="metric-card"
            key={metric.label}
            disabled={!report}
            onClick={() => onFilter(metric.filter as TaskDrilldown)}
          >
            <div className="metric-label">
              {metric.label}
              <metric.icon size={18} />
            </div>
            <strong>
              {metric.value === undefined
                ? "—"
                : metric.value.toLocaleString("en-US")}
            </strong>
            <span>
              {metric.detail}
              <ArrowUpRight size={15} />
            </span>
          </button>
        ))}
      </div>
      <div className="overview-snapshot-note">
        {report
          ? `Current snapshots · ${format(parseISO(report.today), "d MMM yyyy")} · ${report.timeZone}`
          : "Current workspace snapshots"}
      </div>
      <ConnectionOverview
        data={props.data}
        run={props.run}
        demo={Boolean(props.demo)}
        onExplore={onExploreConnections}
        onProject={onProject}
        openTask={props.openTask}
      />
      <div className="overview-analytics-grid" aria-busy={loading}>
        <section
          className="dashboard-panel overview-schedule"
          aria-labelledby="overview-schedule-title"
        >
          <header>
            <div>
              <h3 id="overview-schedule-title">Scheduled workload</h3>
              <p>Open tasks scheduled each day · next 14 days</p>
            </div>
          </header>
          {report ? (
            <ScheduleChart
              rows={report.schedule}
              onDay={(day) =>
                onFilter({
                  open: true,
                  from: day,
                  to: day,
                  dateMode: "overlap",
                })
              }
            />
          ) : (
            placeholder
          )}
        </section>
        <section
          className="dashboard-panel overview-status"
          aria-labelledby="overview-status-title"
        >
          <header>
            <div>
              <h3 id="overview-status-title">Task distribution</h3>
              <p>All active tasks by status · current</p>
            </div>
            <BarChart3 size={18} />
          </header>
          {report ? (
            <StatusDonut statuses={report.statuses} onFilter={onFilter} />
          ) : (
            placeholder
          )}
        </section>
        <section
          className="dashboard-panel overview-attention"
          aria-labelledby="overview-attention-title"
        >
          <header>
            <div>
              <h3 id="overview-attention-title">Needs attention</h3>
              <p>Open active tasks · groups may overlap</p>
            </div>
          </header>
          {report ? (
            <SnapshotBars
              title="Needs attention"
              rows={[
                {
                  key: "overdue",
                  label: "Overdue work",
                  count: report.attention.overdue,
                  onClick: () => onFilter({ open: true, dueBucket: "overdue" }),
                },
                {
                  key: "unassigned",
                  label: "Without an owner",
                  count: report.attention.unassigned,
                  onClick: () =>
                    onFilter({ open: true, assignee: "unassigned" }),
                },
                {
                  key: "unscheduled",
                  label: "Without a schedule",
                  count: report.attention.unscheduled,
                  onClick: () =>
                    onFilter({ open: true, dueBucket: "unscheduled" }),
                },
              ]}
              empty="No open tasks need attention in these groups."
            />
          ) : (
            placeholder
          )}
        </section>
        <section
          className="dashboard-panel"
          aria-labelledby="overview-priority-title"
        >
          <header>
            <div>
              <h3 id="overview-priority-title">Open work by priority</h3>
              <p>Open active tasks · current</p>
            </div>
          </header>
          {report ? (
            <SnapshotBars
              title="Open work by priority"
              rows={[...PRIORITIES].reverse().map((priority) => ({
                key: priority,
                label: PRIORITY_LABEL[priority],
                count: report.priorities[priority],
                onClick: () => onFilter({ priority, open: true }),
              }))}
              empty="No open tasks. All priorities are clear."
            />
          ) : (
            placeholder
          )}
        </section>
        <section
          className="dashboard-panel"
          aria-labelledby="overview-deadline-title"
        >
          <header>
            <div>
              <h3 id="overview-deadline-title">Deadline outlook</h3>
              <p>Open active tasks by calendar date · current</p>
            </div>
          </header>
          {report ? (
            <SnapshotBars
              title="Deadline outlook"
              rows={(
                [
                  ["overdue", "Past due"],
                  ["today", "Due today"],
                  ["future", "After today"],
                  ["unscheduled", "No due date"],
                ] as const
              ).map(([key, label]) => ({
                key,
                label,
                count: report.deadlineBuckets[key],
                onClick: () => onFilter({ dueBucket: key, open: true }),
              }))}
              empty="No open tasks with deadlines to manage."
            />
          ) : (
            placeholder
          )}
        </section>
        <section
          className="dashboard-panel overview-workload"
          aria-labelledby="overview-workload-title"
        >
          <header>
            <div>
              <h3 id="overview-workload-title">Team workload</h3>
              <p>Open active tasks by owner · current</p>
            </div>
          </header>
          {report ? (
            <SnapshotBars
              title="Team workload"
              rows={report.workload.map((item) => ({
                key: item.email || "unassigned",
                label:
                  props.data.members.find(
                    (member) => member.email === item.email,
                  )?.name ||
                  item.email ||
                  "Unassigned",
                count: item.count,
                detail: `${item.overdue} past due`,
                onClick: () =>
                  onFilter({
                    assignee: item.email || "unassigned",
                    open: true,
                  }),
              }))}
              empty="No open tasks. Your team has breathing room."
            />
          ) : (
            placeholder
          )}
        </section>
        <section
          className="dashboard-panel overview-projects"
          aria-labelledby="overview-project-title"
        >
          <header>
            <div>
              <h3 id="overview-project-title">Project progress</h3>
              <p>Completed / all active tasks in each project · current</p>
            </div>
          </header>
          {report ? (
            <SnapshotBars
              title="Project progress"
              rows={report.projectProgress.map((project) => ({
                key: project.id,
                label: project.name,
                count: project.completed,
                total: project.total,
                detail: project.total
                  ? `${Math.round((project.completed / project.total) * 100)}% complete`
                  : "No active tasks",
                onClick: () => onProject(project.id),
              }))}
              empty="Create a project to see its progress here."
              progress
            />
          ) : (
            placeholder
          )}
        </section>
      </div>
    </div>
  );
}
