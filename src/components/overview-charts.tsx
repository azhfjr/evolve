"use client";

import { chartShare } from "@/lib/portfolio-chart-geometry";
import { useId } from "react";
import type { DashboardReport } from "@/lib/workspace-reports";
import type { TaskDrilldown } from "@/lib/dashboard-model";
import { STATUSES, STATUS_LABEL } from "@/lib/types";

const statusColors = {
  backlog: "#94a3b8",
  todo: "#7694a5",
  in_progress: "#17836e",
  review: "#5b6ccd",
  done: "#b1cda9",
};

type BarRow = {
  key: string;
  label: string;
  count: number;
  total?: number;
  detail?: string;
  onClick: () => void;
};

/** Visible values and a native data table keep every chart available without color or a pointer. */
export function SnapshotBars({
  title,
  rows,
  empty,
  progress = false,
}: {
  title: string;
  rows: BarRow[];
  empty: string;
  progress?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const noWork = !progress && rows.every((row) => row.count === 0);
  return (
    <figure className="overview-bars">
      {(!rows.length || noWork) && <p className="overview-empty">{empty}</p>}
      <div className="overview-bar-list">
        {rows.map((row) => (
          <button
            key={row.key}
            className="overview-bar-row"
            onClick={row.onClick}
            aria-label={`${row.label}: ${row.count}${progress ? ` of ${row.total || 0} completed` : " open tasks"}${row.detail ? `, ${row.detail}` : ""}. View ${progress ? "project" : "tasks"}`}
          >
            <span className="overview-bar-heading">
              <span>{row.label}</span>
              <strong>
                {progress
                  ? `${row.count} / ${row.total || 0}`
                  : row.count.toLocaleString("en-US")}
              </strong>
            </span>
            <span className="overview-bar-track" aria-hidden="true">
              <span
                style={{
                  width: `${progress ? (row.total ? (row.count / row.total) * 100 : 0) : (row.count / max) * 100}%`,
                }}
              />
            </span>
            {row.detail && <small>{row.detail}</small>}
          </button>
        ))}
      </div>
      {!!rows.length && (
        <details className="overview-data">
          <summary>
            View data <span className="sr-only">for {title}</span>
          </summary>
          <div className="chart-data-table">
            <table>
              <caption>{title} · current snapshot</caption>
              <thead>
                <tr>
                  <th scope="col">{progress ? "Project" : "Group"}</th>
                  <th scope="col">{progress ? "Completed" : "Open tasks"}</th>
                  {progress && <th scope="col">Total tasks</th>}
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>{row.count}</td>
                    {progress && <td>{row.total || 0}</td>}
                    <td>{row.detail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

export function StatusDonut({
  statuses,
  onFilter,
}: {
  statuses: DashboardReport["statuses"];
  onFilter: (filters: TaskDrilldown) => void;
}) {
  const titleId = useId();
  const total = STATUSES.reduce((sum, status) => sum + statuses[status], 0);
  return (
    <figure className="overview-donut">
      <div className="donut-wrap">
        <svg viewBox="0 0 180 180" role="img" aria-labelledby={titleId}>
          <title
            id={titleId}
          >{`${total} active tasks by status. ${STATUSES.map((status) => `${STATUS_LABEL[status]}: ${statuses[status]}`).join(". ")}`}</title>
          <circle
            cx="90"
            cy="90"
            r="68"
            fill="none"
            className="donut-track"
            strokeWidth="17"
          />
          {STATUSES.map((status, index) => {
            const portion = total ? (statuses[status] / total) * 100 : 0;
            const start = total
              ? (STATUSES.slice(0, index).reduce(
                  (sum, key) => sum + statuses[key],
                  0,
                ) /
                  total) *
                100
              : 0;
            return portion > 0 ? (
              <circle
                key={status}
                cx="90"
                cy="90"
                r="68"
                fill="none"
                stroke={statusColors[status]}
                strokeWidth="17"
                pathLength="100"
                strokeDasharray={`${portion} ${100 - portion}`}
                strokeDashoffset={-start}
                transform="rotate(-90 90 90)"
              />
            ) : null;
          })}
        </svg>
        <div>
          <strong>{total.toLocaleString("en-US")}</strong>
          <span>Active tasks</span>
        </div>
      </div>
      {!total && <p className="overview-empty">No active tasks yet.</p>}
      <div className="status-breakdown">
        {STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => onFilter({ status })}
            aria-label={`${STATUS_LABEL[status]}: ${statuses[status]} active tasks. View tasks`}
          >
            <span>
              <i style={{ background: statusColors[status] }} />
              {STATUS_LABEL[status]}
            </span>
            <strong>
              {statuses[status].toLocaleString("en-US")}{" "}
              <small>({chartShare(statuses[status], total)})</small>
            </strong>
          </button>
        ))}
      </div>
      <details className="overview-data">
        <summary>
          View data <span className="sr-only">for Task distribution</span>
        </summary>
        <div className="chart-data-table">
          <table>
            <caption>Task distribution · current active tasks</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Tasks</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {STATUSES.map((status) => (
                <tr key={status}>
                  <th scope="row">{STATUS_LABEL[status]}</th>
                  <td>{statuses[status].toLocaleString("en-US")}</td>
                  <td>{chartShare(statuses[status], total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function ScheduleChart({
  rows,
  onDay,
}: {
  rows: DashboardReport["schedule"];
  onDay: (day: string) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const noWork = rows.every((row) => row.count === 0);
  return (
    <figure className="overview-schedule-figure">
      {noWork && (
        <p className="overview-empty">
          No open work scheduled in the next 14 days.
        </p>
      )}
      <div
        className="overview-schedule-grid"
        aria-label="Scheduled open tasks by day"
      >
        {rows.map((row) => (
          <button
            type="button"
            key={row.day}
            className="overview-schedule-day"
            onClick={() => onDay(row.day)}
            aria-label={`${row.day}: ${row.count} open scheduled tasks. View tasks`}
          >
            <strong>{row.count.toLocaleString("en-US")}</strong>
            <span className="overview-schedule-track" aria-hidden="true">
              <span style={{ height: `${(row.count / max) * 100}%` }} />
            </span>
            <time dateTime={row.day}>
              <span>{Number(row.day.slice(8))}</span>
              <span>
                {new Intl.DateTimeFormat("en-GB", {
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${row.day}T12:00:00Z`))}
              </span>
            </time>
          </button>
        ))}
      </div>
      <figcaption>
        A task spanning several days is counted on each scheduled day. Select a
        day to view its open work.
      </figcaption>
      <details className="overview-data">
        <summary>
          View data <span className="sr-only">for Scheduled workload</span>
        </summary>
        <div className="chart-data-table">
          <table>
            <caption>Scheduled workload · open tasks by calendar day</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Open tasks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.day}>
                  <th scope="row">
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => onDay(row.day)}
                    >
                      {row.day}
                    </button>
                  </th>
                  <td>{row.count.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
