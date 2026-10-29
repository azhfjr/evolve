"use client";
import { useState, type ReactNode, type KeyboardEvent } from "react";
import {
  chartRatios,
  pieSegments,
  chartTick,
  chartShare,
} from "@/lib/portfolio-chart-geometry";
export type ChartDatum = {
  label: string;
  value: number | string;
  color?: string;
  display?: string;
  records?: number;
  action: () => void;
};
export const categoryColor = (name: string) =>
  ({
    Pembangkit: "var(--chart-generation)",
    Transmisi: "var(--chart-transmission)",
    "Gardu Induk": "var(--chart-substation)",
  })[name] ?? "var(--chart-neutral)";
const fallback = ["var(--accent)", "var(--chart-neutral)"];
function activate(e: KeyboardEvent, action: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    action();
  }
}
export function ChartEmpty({
  message = "No matching projects",
  hint = "Change the filters or add projects to start exploring.",
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="portfolio-chart-empty">
      <svg viewBox="0 0 96 64" aria-hidden="true">
        <path d="M8 54H88M20 44V30M40 44V18M60 44V36M80 44V24" />
      </svg>
      <strong>{message}</strong>
      <p>{hint}</p>
    </div>
  );
}
function ChartFrame({
  kind,
  label,
  empty,
  emptyMessage,
  emptyHint,
  children,
}: {
  kind: string;
  label: string;
  empty: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="portfolio-plot"
      data-visualization={kind}
      aria-label={label}
    >
      {empty ? (
        <ChartEmpty message={emptyMessage} hint={emptyHint} />
      ) : (
        children
      )}
    </div>
  );
}
function DataTable({
  rows,
  total,
  groupLabel = "Group",
  valueLabel = "Value",
  showRecords = false,
}: {
  rows: ChartDatum[];
  total?: number;
  groupLabel?: string;
  valueLabel?: string;
  showRecords?: boolean;
}) {
  return (
    <details className="dashboard-data">
      <summary>View data</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{groupLabel}</th>
            <th scope="col">{valueLabel}</th>
            {showRecords && <th scope="col">Records</th>}
            {total !== undefined && <th scope="col">Share</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.display ?? r.value.toLocaleString()}</td>
              {showRecords && <td>{r.records ?? "—"}</td>}
              {total !== undefined && (
                <td>{chartShare(Number(r.value), total)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
function Tooltip({ text }: { text: string }) {
  return (
    <div role="status" className="portfolio-tooltip" aria-live="polite">
      {text || "Select a value to explore."}
    </div>
  );
}
export function RoundChart({
  rows,
  donut = false,
  label,
}: {
  rows: ChartDatum[];
  donut?: boolean;
  label: string;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const values = rows.map((r) => Number(r.value)),
    total = values.reduce((s, v) => s + v, 0),
    parts = pieSegments(values);
  const activeRow = rows.find((r) => r.label === activeLabel);
  const tip = activeRow
    ? `${activeRow.label}: ${activeRow.value.toLocaleString()}, ${chartShare(Number(activeRow.value), total)}`
    : "";
  function point(angle: number) {
    const a = ((angle - 90) * Math.PI) / 180;
    return `${120 + Math.cos(a) * 90} ${120 + Math.sin(a) * 90}`;
  }
  return (
    <>
      <ChartFrame kind={donut ? "donut" : "pie"} label={label} empty={!total}>
        <svg viewBox="0 0 240 240" role="group" aria-label={label}>
          {parts.map((p) => {
            const r = rows[p.index],
              description = `${r.label}: ${r.value.toLocaleString()}, ${chartShare(Number(r.value), total)}`;
            const path =
              p.fraction >= 1
                ? "M120 30 A90 90 0 1 1 120 210 A90 90 0 1 1 120 30 Z"
                : `M120 120 L${point(p.start)} A90 90 0 ${p.fraction > 0.5 ? 1 : 0} 1 ${point(p.end)} Z`;
            return (
              <path
                key={p.index}
                d={path}
                fill={r.color ?? fallback[p.index % fallback.length]}
                role="button"
                tabIndex={0}
                aria-label={`Select ${description}`}
                onClick={r.action}
                onKeyDown={(e) => activate(e, r.action)}
                onFocus={() => setActiveLabel(r.label)}
                onBlur={() => setActiveLabel(null)}
                onPointerEnter={() => setActiveLabel(r.label)}
                onPointerLeave={(e) => {
                  if (document.activeElement !== e.currentTarget)
                    setActiveLabel(null);
                }}
              >
                <title>{description}</title>
              </path>
            );
          })}
          {donut && (
            <>
              <circle
                cx="120"
                cy="120"
                r="58"
                className="portfolio-donut-hole"
              />
              <text
                x="120"
                y="119"
                textAnchor="middle"
                className="portfolio-donut-total"
              >
                {total.toLocaleString()}
              </text>
              <text
                x="120"
                y="141"
                textAnchor="middle"
                className="portfolio-donut-caption"
              >
                projects
              </text>
            </>
          )}
        </svg>
      </ChartFrame>
      <Tooltip text={tip} />
      <div className="portfolio-legend">
        {rows.map((r, i) => (
          <button
            key={r.label}
            aria-label={r.label}
            onClick={r.action}
            onFocus={() => setActiveLabel(r.label)}
            onBlur={() => setActiveLabel(null)}
            onPointerEnter={() => setActiveLabel(r.label)}
            onPointerLeave={(e) => {
              if (document.activeElement !== e.currentTarget)
                setActiveLabel(null);
            }}
          >
            <i
              style={{ background: r.color ?? fallback[i % fallback.length] }}
            />
            <span>{r.label}</span>
            <strong>{r.value.toLocaleString()}</strong>
            <small>{chartShare(Number(r.value), total)}</small>
          </button>
        ))}
      </div>
      <p className="br-note">
        Shares use matching records; rounded percentages may not sum to 100%.
      </p>
      <DataTable rows={rows} total={total} />
    </>
  );
}
export function ColumnChart({
  rows,
  unit,
  source = "project",
  projectCount,
}: {
  rows: ChartDatum[];
  unit: string;
  source?: "project" | "asset";
  projectCount?: number;
}) {
  const ratios = chartRatios(rows.map((r) => r.value));
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const activeRow = rows.find((r) => r.label === activeLabel);
  const tip = activeRow
    ? `${activeRow.label}: ${activeRow.display ?? activeRow.value} ${unit}`
    : "";
  const maxIndex = ratios.indexOf(1),
    max = maxIndex < 0 ? "0" : String(rows[maxIndex].value);
  const width = Math.max(520, rows.length * 76 + 100),
    height = 250,
    bottom = 204,
    plotHeight = 170,
    barWidth = Math.min(52, ((width - 96) / Math.max(rows.length, 1)) * 0.65);
  return (
    <>
      <ChartFrame
        kind="columns"
        label={`Capacity by COD year in ${unit || "selected unit"}`}
        empty={!rows.length}
        emptyMessage={
          projectCount === 0
            ? "No matching projects"
            : source === "asset"
              ? "No linked asset capacity recorded"
              : "No project capacity recorded"
        }
        emptyHint={
          projectCount === 0
            ? "Change the filters to explore other projects."
            : source === "asset"
              ? "Link assets and record their capacity and unit in the Assets database."
              : "Record capacity and its unit in the matching project details."
        }
      >
        <div className="portfolio-plot-scroll">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ minWidth: width }}
            role="group"
            aria-label={`Yearly capacity in ${unit}`}
          >
            <text x="18" y="19">
              {unit}
            </text>
            {(maxIndex < 0 ? [0] : [0, 0.5, 1]).map((f) => (
              <g key={f}>
                <line
                  x1="76"
                  x2={width - 12}
                  y1={bottom - f * plotHeight}
                  y2={bottom - f * plotHeight}
                />
                <text x="67" y={bottom - f * plotHeight + 4} textAnchor="end">
                  {f === 0
                    ? "0"
                    : f === 1
                      ? chartTick(max, 1)
                      : chartTick(max, 0.5)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const x = 90 + (i * (width - 100)) / rows.length,
                description = `${r.label}: ${r.display ?? r.value} ${unit}`;
              return (
                <g key={r.label}>
                  <rect
                    x={x}
                    y={bottom - ratios[i] * plotHeight}
                    width={barWidth}
                    height={Math.max(2, ratios[i] * plotHeight)}
                    fill="var(--accent)"
                    role="button"
                    tabIndex={0}
                    aria-label={description}
                    onClick={r.action}
                    onKeyDown={(e) => activate(e, r.action)}
                    onFocus={() => setActiveLabel(r.label)}
                    onBlur={() => setActiveLabel(null)}
                    onPointerEnter={() => setActiveLabel(r.label)}
                    onPointerLeave={(e) => {
                      if (document.activeElement !== e.currentTarget)
                        setActiveLabel(null);
                    }}
                  >
                    <title>{description}</title>
                  </rect>
                  <text
                    x={x + barWidth / 2}
                    y={bottom + 24}
                    textAnchor="middle"
                  >
                    {r.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </ChartFrame>
      <Tooltip text={tip} />
      <DataTable
        groupLabel="COD year"
        valueLabel="Capacity"
        showRecords
        rows={rows.map((r) => ({
          ...r,
          display: `${r.display ?? r.value} ${unit}`,
        }))}
      />
    </>
  );
}
export function StackedColumns({
  groups,
}: {
  groups: { label: string; segments: ChartDatum[] }[];
}) {
  const [active, setActive] = useState<{
    group: string;
    segment: string;
  } | null>(null);
  const activeRow = groups
    .find((g) => g.label === active?.group)
    ?.segments.find((r) => r.label === active?.segment);
  const tip =
    active && activeRow
      ? `${active.group}, ${active.segment}: ${activeRow.value} of ${groups.find((g) => g.label === active.group)?.segments.reduce((n, r) => n + Number(r.value), 0) ?? 0} projects (${chartShare(Number(activeRow.value), groups.find((g) => g.label === active.group)?.segments.reduce((n, r) => n + Number(r.value), 0) ?? 0)})`
      : "";
  const totals = groups.map((g) =>
      g.segments.reduce((s, r) => s + Number(r.value), 0),
    ),
    maximum = Math.max(...totals, 0);
  const width = Math.max(520, groups.length * 150 + 80),
    bottom = 208,
    plotHeight = 170;
  return (
    <>
      <ChartFrame
        kind="stacked-columns"
        label="Document readiness by category"
        empty={!groups.length}
      >
        <div className="portfolio-plot-scroll">
          <svg
            viewBox={`0 0 ${width} 250`}
            style={{ minWidth: width }}
            role="group"
            aria-label="Document readiness counts"
          >
            <text x="16" y="17">
              Projects
            </text>
            {[...new Set([0, Math.ceil(maximum / 2), maximum])].map((tick) => (
              <g key={tick}>
                <line
                  x1="54"
                  x2={width - 12}
                  y1={bottom - (maximum ? tick / maximum : 0) * plotHeight}
                  y2={bottom - (maximum ? tick / maximum : 0) * plotHeight}
                />
                <text
                  x="45"
                  y={bottom - (maximum ? tick / maximum : 0) * plotHeight + 4}
                  textAnchor="end"
                >
                  {tick}
                </text>
              </g>
            ))}
            {groups.map((g, i) => {
              let offset = 0;
              const x = 84 + (i * (width - 85)) / groups.length;
              return (
                <g key={g.label}>
                  {g.segments.map((r) => {
                    const value = Number(r.value),
                      h = maximum ? (value / maximum) * plotHeight : 0,
                      y = bottom - offset - h;
                    offset += h;
                    const description = `${g.label}, ${r.label}: ${value}`;
                    return value > 0 ? (
                      <rect
                        key={r.label}
                        x={x}
                        y={y}
                        width="66"
                        height={h}
                        fill={r.color}
                        role="button"
                        tabIndex={0}
                        aria-label={description}
                        onClick={r.action}
                        onKeyDown={(e) => activate(e, r.action)}
                        onFocus={() =>
                          setActive({ group: g.label, segment: r.label })
                        }
                        onBlur={() => setActive(null)}
                        onPointerEnter={() =>
                          setActive({ group: g.label, segment: r.label })
                        }
                        onPointerLeave={(e) => {
                          if (document.activeElement !== e.currentTarget)
                            setActive(null);
                        }}
                      >
                        <title>{description}</title>
                      </rect>
                    ) : null;
                  })}
                  <text
                    x={x + 33}
                    y={
                      bottom -
                      (maximum ? (totals[i] / maximum) * plotHeight : 0) -
                      8
                    }
                    textAnchor="middle"
                  >
                    {totals[i].toLocaleString("en-US")}
                  </text>
                  <text x={x + 33} y={bottom + 24} textAnchor="middle">
                    {g.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </ChartFrame>
      <Tooltip text={tip} />
      <div className="portfolio-series-legend">
        {(
          groups[0]?.segments ?? [
            { label: "Valid", color: "var(--chart-valid)" },
            { label: "Needs review", color: "var(--chart-review)" },
            { label: "No files", color: "var(--chart-neutral)" },
          ]
        ).map((r) => (
          <span key={r.label}>
            <i style={{ background: r.color }} />
            {r.label}
          </span>
        ))}
      </div>
      <details className="dashboard-data">
        <summary>View data</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Valid</th>
              <th scope="col">Needs review</th>
              <th scope="col">No files</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.label}>
                <th scope="row">{g.label}</th>
                {g.segments.map((r) => (
                  <td key={r.label}>
                    <button onClick={r.action}>
                      {r.value.toLocaleString()}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
export function HorizontalBars({
  rows,
  total,
  completeRows = rows,
}: {
  rows: ChartDatum[];
  total: number;
  completeRows?: ChartDatum[];
}) {
  const maximum = Math.max(...rows.map((r) => Number(r.value)), 0);
  return (
    <>
      <div
        className="portfolio-horizontal"
        data-visualization="horizontal-bars"
        style={
          rows.length ? { height: Math.min(280, rows.length * 60) } : undefined
        }
      >
        {rows.length ? (
          rows.map((r) => (
            <div className="portfolio-horizontal-row" key={r.label}>
              <button aria-label={r.label} onClick={r.action}>
                <span>{r.label}</span>
                <strong>{r.value.toLocaleString()}</strong>
              </button>
              <div className="portfolio-horizontal-track" aria-hidden="true">
                <i
                  style={{
                    width: `${maximum ? (Number(r.value) / maximum) * 100 : 0}%`,
                    background: r.color ?? "var(--accent)",
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <ChartEmpty message="No matching records" />
        )}
      </div>
      <DataTable rows={completeRows} total={total} />
    </>
  );
}
