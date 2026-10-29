"use client";
import { chartShare } from "@/lib/portfolio-chart-geometry";
import { useId, useState, useRef } from "react";
import boundaries from "../../../public/geodata/kalimantan-provinces.json";
import { projectedBoundaries } from "@/lib/board-room/region-geometry";
import { categoryColor } from "./portfolio-charts";
import {
  MAP_CATEGORIES,
  type Region,
  type RegionalAnalytics,
} from "@/lib/board-room/regions";
import type { BoardQuery } from "@/lib/board-room/model";
import { chartQuery } from "@/lib/board-room/chart-filters";
const paths = projectedBoundaries(boundaries);
const number = (n: number) => n.toLocaleString("en-US");
export function RegionalMap({
  data,
  query,
  onQueryChange,
}: {
  data: RegionalAnalytics;
  query: BoardQuery;
  onQueryChange: (q: BoardQuery) => void;
}) {
  const title = useId();
  const container = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1),
    [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const categoryLabel = (value: string) =>
    value === "uncategorized" ? "Uncategorized" : value;
  const categorySummary = (row: (typeof data.provinces)[number]) =>
    row.categories
      ?.map((c) => `${categoryLabel(c.category)}: ${number(c.contextCount)}`)
      .join("; ") ?? "";
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const highlight = focused ?? hovered;
  const rows = [
    ...data.provinces,
    { code: "missing", name: "Missing location", ...data.missing },
    {
      code: "unrecognized",
      name: "Unrecognized location",
      ...data.unrecognized,
    },
  ];
  const active = rows.find((r) => r.code === (highlight ?? query.region));
  const max = Math.max(0, ...data.provinces.map((p) => p.contextCount));
  function select(region: Region) {
    onQueryChange(
      chartQuery(query, { region: query.region === region ? "" : region }),
    );
  }
  const href =
    "/board-room?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(query).map(([k, v]) => [k, String(v)]),
      ),
      section: "projects",
      page: "1",
    });
  return (
    <section
      ref={container}
      className="br-panel regional-panel"
      aria-label="Kalimantan regional distribution"
    >
      <div className="br-panel-heading">
        <h2>Projects across Kalimantan</h2>
        <p>
          Province comparison uses current filters before location selection.
        </p>
      </div>
      <div
        className="regional-category-legend connected-actions"
        aria-label="Map category filters"
      >
        <button
          aria-pressed={!query.category}
          onClick={() => onQueryChange(chartQuery(query, { category: "" }))}
        >
          All categories
        </button>
        {MAP_CATEGORIES.map((category) => (
          <button
            key={category}
            aria-pressed={query.category === category}
            onClick={() =>
              onQueryChange(
                chartQuery(query, {
                  category: query.category === category ? "" : category,
                }),
              )
            }
          >
            <i
              aria-hidden="true"
              style={{
                background: categoryColor(
                  category === "uncategorized" ? "" : category,
                ),
              }}
            />
            {categoryLabel(category)}
            <strong>
              {number(
                rows.reduce(
                  (n, r) =>
                    n +
                    (r.categories?.find((c) => c.category === category)
                      ?.matchingCount ?? 0),
                  0,
                ),
              )}
            </strong>
          </button>
        ))}
      </div>
      <div
        className="regional-map-tools connected-actions"
        aria-label="Map view controls"
      >
        <button
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
          aria-label="Zoom map in"
        >
          Zoom map in
        </button>
        <button
          disabled={zoom <= 1}
          onClick={() => {
            setZoom((z) => Math.max(1, z - 0.5));
            setOffset({ x: 0, y: 0 });
          }}
          aria-label="Zoom map out"
        >
          Zoom map out
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          Fit map
        </button>
        <button
          onClick={() => {
            if (document.fullscreenElement)
              void document.exitFullscreen().catch(() => {});
            else void container.current?.requestFullscreen?.().catch(() => {});
          }}
        >
          Fullscreen
        </button>
        {zoom > 1 && (
          <>
            <button
              aria-label="Pan map left"
              onClick={() => setOffset((o) => ({ ...o, x: o.x + 40 }))}
            >
              ←
            </button>
            <button
              aria-label="Pan map right"
              onClick={() => setOffset((o) => ({ ...o, x: o.x - 40 }))}
            >
              →
            </button>
            <button
              aria-label="Pan map up"
              onClick={() => setOffset((o) => ({ ...o, y: o.y + 40 }))}
            >
              ↑
            </button>
            <button
              aria-label="Pan map down"
              onClick={() => setOffset((o) => ({ ...o, y: o.y - 40 }))}
            >
              ↓
            </button>
          </>
        )}
      </div>
      <div className="regional-body">
        <div className="regional-geography">
          <svg
            viewBox="0 0 720 480"
            role="img"
            aria-labelledby={title}
            onPointerDown={(e) => {
              if (zoom > 1 && e.target === e.currentTarget) {
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  ox: offset.x,
                  oy: offset.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                const ratio =
                  720 / e.currentTarget.getBoundingClientRect().width;
                setOffset({
                  x: drag.current.ox + (e.clientX - drag.current.x) * ratio,
                  y: drag.current.oy + (e.clientY - drag.current.y) * ratio,
                });
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <g
              transform={`translate(${offset.x} ${offset.y}) translate(360 240) scale(${zoom}) translate(-360 -240)`}
            >
              <title
                id={title}
              >{`Kalimantan project distribution. ${data.provinces.map((p) => `${p.name}: ${p.contextCount}`).join(". ")}. Use the province controls to filter.`}</title>
              {paths.map((path) => {
                const row = data.provinces.find((p) => p.code === path.code)!;
                return (
                  <path
                    key={path.code}
                    d={path.d}
                    fillRule="evenodd"
                    className={`regional-province${query.region === path.code ? " is-selected" : ""}${highlight === path.code ? " is-focused" : ""}`}
                    style={{
                      fill: row.contextCount
                        ? `color-mix(in srgb, var(--accent) ${25 + (75 * row.contextCount) / Math.max(1, max)}%, var(--surface))`
                        : "var(--soft)",
                    }}
                    onMouseEnter={() => setHovered(path.code)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => select(row.code)}
                  >
                    <title>{`${row.name}: ${number(row.contextCount)} projects. ${categorySummary(row)}`}</title>
                  </path>
                );
              })}
            </g>
          </svg>
          <div className="regional-scale">
            <i className="regional-zero" aria-hidden="true" />
            <span>0</span>
            {max > 1 ? (
              <>
                <span>1</span>
                <i
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(to right,color-mix(in srgb,var(--accent) ${25 + 75 / max}%,var(--surface)),var(--accent))`,
                  }}
                />
                <span>{number(max)}</span>
              </>
            ) : max === 1 ? (
              <>
                <i className="regional-one" aria-hidden="true" />
                <span>1</span>
              </>
            ) : null}
            <span>projects</span>
          </div>
          {!data.contextTotal && (
            <p className="br-note">
              No projects match these filters. Add projects or broaden the
              filters to see their regional distribution.
            </p>
          )}
          <p className="regional-tooltip" role="status">
            {active
              ? `${active.name}: ${number(active.contextCount)} projects before location filters · ${number(active.matchingCount)} matching all filters. ${active.categories?.map((c) => `${categoryLabel(c.category)}: ${number(c.contextCount)}`).join("; ") ?? ""}`
              : "Select a province to explore its projects."}
          </p>
        </div>
        <div className="regional-controls" aria-label="Province filters">
          {rows.map((r) => (
            <button
              key={r.code}
              aria-pressed={query.region === r.code}
              onFocus={() => setFocused(r.code)}
              onBlur={() => setFocused(null)}
              onMouseEnter={() => setHovered(r.code)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => select(r.code as Region)}
            >
              <span>
                {r.name}
                <small>
                  {data.contextTotal
                    ? `${chartShare(r.contextCount, data.contextTotal)} of comparison projects`
                    : "No comparison projects"}
                </small>
              </span>
              <strong>{number(r.contextCount)}</strong>
            </button>
          ))}
          <div className="regional-result">
            <span>
              {number(data.matchingTotal)} matching projects ·{" "}
              {number(data.contextTotal)} before location filters
            </span>
            {query.region && (
              <button
                className="br-text"
                onClick={() => onQueryChange(chartQuery(query, { region: "" }))}
              >
                Clear region
              </button>
            )}
            <a className="br-text" href={href}>
              View matching projects
            </a>
          </div>
        </div>
      </div>
      <details className="dashboard-data regional-data">
        <summary>View regional data</summary>
        <table>
          <caption>
            Project counts by normalized province. Comparison ignores location
            filters; matching includes all filters.
          </caption>
          <thead>
            <tr>
              <th scope="col">Region</th>
              <th scope="col">Comparison projects</th>
              <th scope="col">Matching projects</th>
              {MAP_CATEGORIES.map((c) => (
                <th key={c} scope="col">
                  {categoryLabel(c)} (matching)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <th scope="row">{r.name}</th>
                <td>{number(r.contextCount)}</td>
                <td>{number(r.matchingCount)}</td>
                {MAP_CATEGORIES.map((c) => (
                  <td key={c}>
                    {number(
                      r.categories?.find((v) => v.category === c)
                        ?.matchingCount ?? 0,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{number(data.contextTotal)}</td>
              <td>{number(data.matchingTotal)}</td>
              {MAP_CATEGORIES.map((c) => (
                <td key={c}>
                  {number(
                    rows.reduce(
                      (n, r) =>
                        n +
                        (r.categories?.find((v) => v.category === c)
                          ?.matchingCount ?? 0),
                      0,
                    ),
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </details>
      <details className="regional-source">
        <summary>Boundary source and licence</summary>
        <p>
          © OpenStreetMap contributors. Boundaries distributed by geoBoundaries;
          OpenStreetMap / Wambacher, 2017. Dataset IDN-ADM1-65028918, revision
          9469f09. Geographic display represents this source vintage.
        </p>
        <a href="https://www.openstreetmap.org/copyright">
          OpenStreetMap attribution
        </a>
        <a href="/geodata/ODbL-1.0.txt">Open Database License 1.0</a>
        <a href="/geodata/kalimantan-provinces.json" download>
          Boundary database
        </a>
        <a href="/geodata/provenance.json">Source and transformation details</a>
      </details>
    </section>
  );
}
