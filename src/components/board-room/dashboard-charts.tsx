"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { BoardSnapshot, BoardQuery } from "@/lib/board-room/model";
import { chartQuery } from "@/lib/board-room/chart-filters";
import { AppSelect } from "../app-select";
import {
  RoundChart,
  ColumnChart,
  StackedColumns,
  HorizontalBars,
  categoryColor,
} from "./portfolio-charts";
function Card({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="br-panel dashboard-card" aria-label={title}>
      <div className="br-panel-heading">
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      <div className="dashboard-card-body">{children}</div>
    </section>
  );
}
export function DashboardSummary({
  snapshot,
  onQueryChange,
  query,
}: {
  snapshot: BoardSnapshot;
  query: BoardQuery;
  onQueryChange: (q: BoardQuery) => void;
}) {
  const s = snapshot.summary,
    a = snapshot.analytics;
  return (
    <section className="dashboard-summary" aria-label="Portfolio summary">
      {[
        { label: "Projects", value: s.total, patch: {} },
        {
          label: "Linked assets",
          value: a.linkedAssets,
          patch: { assetCoverage: "linked" as const },
        },
        {
          label: "Valid projects",
          value: s.valid,
          patch: { validation: "valid" as const },
        },
        {
          label: "Needs document review",
          value: s.needsReview,
          patch: { validation: "review" as const },
        },
      ].map((m) => (
        <button
          key={m.label}
          onClick={() => onQueryChange(chartQuery(query, m.patch))}
        >
          <span>{m.label}</span>
          <strong>{m.value.toLocaleString()}</strong>
          <small>
            {m.label === "Linked assets"
              ? "Explore projects with assets"
              : "Across matching projects"}
          </small>
        </button>
      ))}
    </section>
  );
}
export function DashboardCharts({
  snapshot,
  query,
  onQueryChange,
}: {
  snapshot: BoardSnapshot;
  query: BoardQuery;
  onQueryChange: (q: BoardQuery) => void;
}) {
  const router = useRouter();
  const a = snapshot.analytics,
    s = snapshot.summary;
  const [assetView, setAssetView] = useState("coverage"),
    [source, setSource] = useState<"project" | "asset">("project"),
    [selectedUnit, setUnit] = useState(""),
    [allLocations, setAllLocations] = useState(false);
  const units = [
    ...new Set(
      a.capacity.filter((r) => r.source === source).map((r) => r.unit),
    ),
  ];
  const unit = units.includes(selectedUnit) ? selectedUnit : (units[0] ?? "");
  const capacities = a.capacity.filter(
    (r) => r.source === source && r.unit === unit,
  );
  const filter = (patch: Partial<BoardQuery>) =>
    onQueryChange(chartQuery(query, patch));
  const category = (name: string) =>
    name && name !== "Uncategorized"
      ? (name as BoardQuery["category"])
      : "uncategorized";
  const locations = a.locations.map((r) => ({
    label: r.location || "Unspecified",
    value: r.count,
    action: () =>
      filter({
        location: r.location ?? "",
        missingLocation: r.location === null,
      }),
  }));
  const visibleLocations = allLocations ? locations : locations.slice(0, 8);
  if (!allLocations && locations.length > 8)
    visibleLocations.push({
      label: `Other (${locations.length - 8} locations)`,
      value: locations.slice(8).reduce((n, r) => n + r.value, 0),
      action: () => setAllLocations(true),
    });
  return (
    <section className="dashboard-analysis" aria-label="Portfolio charts">
      <Card
        title="Document readiness"
        note="Current evidence · uploading alone does not make a project valid"
      >
        <StackedColumns
          groups={a.evidence.map((r) => ({
            label: r.category || "Uncategorized",
            segments: (
              [
                { state: "valid", label: "Valid", color: "var(--chart-valid)" },
                {
                  state: "review",
                  label: "Needs review",
                  color: "var(--chart-review)",
                },
                {
                  state: "none",
                  label: "No files",
                  color: "var(--chart-neutral)",
                },
              ] as const
            ).map((x) => ({
              label: x.label,
              value: r[x.state],
              color: x.color,
              action: () =>
                filter({ category: category(r.category), validation: x.state }),
            })),
          }))}
        />
      </Card>
      <Card
        title="Asset overview"
        note="Linked assets belong to matching projects"
      >
        <label className="dashboard-select">
          Show
          <AppSelect
            aria-label="Asset chart"
            value={assetView}
            onValueChange={setAssetView}
          >
            <option value="coverage">Project coverage</option>
            <option value="categories">Asset categories</option>
          </AppSelect>
        </label>
        {assetView === "coverage" ? (
          <RoundChart
            donut
            label="Project asset coverage"
            rows={[
              {
                label: "Projects with assets",
                value: a.coverage.linked,
                action: () => filter({ assetCoverage: "linked" }),
              },
              {
                label: "Projects without assets",
                value: a.coverage.unlinked,
                action: () => filter({ assetCoverage: "unlinked" }),
              },
            ]}
          />
        ) : (
          <HorizontalBars
            total={a.linkedAssets}
            rows={a.assetCategories.map((r) => ({
              label: r.category || "Uncategorized",
              value: r.count,
              color: categoryColor(r.category),
              action: () => {
                const p = new URLSearchParams({
                  section: "assets",
                  assetCategory: r.category,
                  projectScope: JSON.stringify(query),
                });
                router.push("/board-room?" + p);
              },
            }))}
          />
        )}
        <p className="br-note">
          {a.coverage.unassignedPortfolioAssets.toLocaleString()} unassigned
          assets across the whole portfolio; not filtered by project COD.
        </p>
      </Card>
      <Card
        title="Projects by category"
        note={`${s.total.toLocaleString()} matching projects · primary categories`}
      >
        <RoundChart
          label="Projects by category"
          rows={s.categories.map((r) => ({
            label: r.name,
            value: r.total,
            color: categoryColor(r.name),
            action: () => filter({ category: category(r.name) }),
          }))}
        />
      </Card>
      <Card
        title="Capacity by planned COD"
        note="Project and asset figures are independent · units are never combined"
      >
        <div className="dashboard-selects">
          <label className="dashboard-select">
            Source
            <AppSelect
              aria-label="Capacity source"
              value={source}
              onValueChange={(v) => setSource(v as "project" | "asset")}
            >
              <option value="project">Project capacity</option>
              <option value="asset">Linked asset capacity</option>
            </AppSelect>
          </label>
          <label className="dashboard-select">
            Unit
            <AppSelect
              aria-label="Capacity unit"
              value={unit}
              onValueChange={setUnit}
            >
              {units.length ? (
                units.map((u) => (
                  <option key={u} value={u}>
                    {u || "Unspecified unit"}
                  </option>
                ))
              ) : (
                <option value="">No capacity data</option>
              )}
            </AppSelect>
          </label>
        </div>
        <ColumnChart
          source={source}
          projectCount={s.total}
          unit={unit}
          rows={capacities.map((r) => ({
            label: String(r.year ?? "Unscheduled"),
            value: r.total,
            records: r.measuredCount,
            action: () => {
              if (source === "project")
                filter({
                  year: r.year === null ? "unknown" : String(r.year),
                  unit,
                });
              else
                router.push(
                  "/board-room?" +
                    new URLSearchParams({
                      section: "assets",
                      assetUnit: unit,
                      projectScope: JSON.stringify({
                        ...query,
                        year: r.year === null ? "unknown" : String(r.year),
                      }),
                    }),
                );
            },
          }))}
        />
        <p className="br-note">
          {source === "project"
            ? a.missingCapacity.projects
            : a.missingCapacity.assets}{" "}
          records without capacity.
        </p>
      </Card>
      <Card
        title="Projects by location"
        note="Recorded project locations · select a location to explore"
      >
        <HorizontalBars
          total={s.total}
          rows={visibleLocations}
          completeRows={locations}
        />
        {locations.length > 8 && (
          <button
            className="br-text"
            onClick={() => setAllLocations((v) => !v)}
          >
            {allLocations ? "Show leading locations" : "Show all locations"}
          </button>
        )}
      </Card>
    </section>
  );
}
