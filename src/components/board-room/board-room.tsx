"use client";
import { useConnectedData } from "../connected/data";
import type { TemplateView } from "@/lib/project-template/service";
import { chartQuery } from "@/lib/board-room/chart-filters";
import { preserveBoardContext } from "@/lib/board-room/navigation-context";
import { clearBrowserDrafts } from "@/lib/connected/drafts";
import "@/app/board-review.css";
import "@/app/board-dashboard.css";
import { ProjectAssetMap } from "../connected/project-asset-map";
import { StorylineWorkspace } from "../connected/storyline-workspace";
import { CostsWorkspace } from "./costs-workspace";
import {
  TemplateNavigationProvider,
  useTemplateNavigation,
} from "./template-recovery";
import { ProjectTemplateManager } from "./project-template-manager";
import { RegionalMap } from "./regional-map";
import { DashboardCharts, DashboardSummary } from "./dashboard-charts";
import { ProjectCSVGuide } from "../connected/project-csv-guide";
import { AppSelect } from "../app-select";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { clearTaskDrafts } from "@/lib/task-composer";
import { clearProjectDrafts } from "@/lib/project-composer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Table2,
  Database,
  FileText,
  ChartNoAxesCombined,
  Settings,
  Upload,
  Plus,
  Search,
  ArrowUpRight,
  ChevronRight,
  Check,
  RefreshCw,
  Map,
  History,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  BOARD_TITLE,
  EMPTY_QUERY,
  PRIMARY_CATEGORIES,
  querySchema,
  documentStatus,
  type BoardSnapshot,
  type BoardDetail,
  type BoardQuery,
  type BoardProject,
} from "@/lib/board-room/model";
import { boardGet, boardRequest } from "./api";
import {
  experienceAttributes,
  useWorkspaceAppearance,
} from "../workspace-appearance";
import { BoardNavigation } from "./navigation";
import { BoardSavedViews } from "./saved-views";
import { boardViewFiltersSchema } from "@/lib/board-room/saved-views-model";
import { StageTrack, ProjectDetail } from "./project-detail";
import { ProjectForm } from "./project-form";
import { ImportDialog } from "./import-dialog";
import { ImportHistory } from "./import-history";
import { PortfolioReport } from "./portfolio-report";
import { useRememberedWorkspace } from "../connected/personal";
import { useWorkspaceLive } from "../connected/live";
import { AssetsWorkspace } from "../connected/assets";
import { QualityWorkspace } from "../connected/explore";
import { StageSettings } from "./settings";
const WorkspaceManagementPanel = dynamic(
  () => import("../workspace-management-panel"),
);
const colors: Record<string, string> = {
  Pembangkit: "#49795c",
  Transmisi: "#7d68bd",
  "Gardu Induk": "#b77740",
};
const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: Table2 },
  { id: "map", label: "Geographic Map", icon: Map },
  { id: "storyline", label: "Storyline", icon: History },
  { id: "costs", label: "Project costs", icon: Wallet },
  { id: "project-template", label: "Project Fields", icon: Settings },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
  { id: "database", label: "Database", icon: Database },
  { id: "assets", label: "Assets", icon: Database },
  { id: "connections", label: "Project–Asset Connections", icon: Table2 },
  { id: "quality", label: "Data quality", icon: ChartNoAxesCombined },
  { id: "settings", label: "Stage settings", icon: Settings },
];
function parameters(q: BoardQuery) {
  return new URLSearchParams(
    Object.entries(q)
      .filter(([k, v]) => v != null && v !== "" && (k !== "page" || v !== 1))
      .map(([k, v]) => [k, String(v)]),
  );
}
function Capacity({ p }: { p: BoardProject }) {
  return (
    <>
      {p.capacity === null ? (
        "Not set"
      ) : (
        <>
          {p.capacity.toLocaleString("en-US")} <small>{p.unit}</small>
        </>
      )}
    </>
  );
}
function BoardRoomContent({
  initialData,
  initialQuery = EMPTY_QUERY,
  initialProjectId,
  initialProjectDetail,
  initialSection = "overview",
  initialProjectTab = "overview",
}: {
  initialData: BoardSnapshot;
  initialQuery?: BoardQuery;
  initialProjectId?: string;
  initialProjectDetail?: BoardDetail;
  initialSection?: string;
  initialProjectTab?: import("../connected/hub").HubTab;
}) {
  const templateNavigation = useTemplateNavigation();
  const template = useConnectedData<TemplateView>(
    "/api/board-room/project-template",
  );
  const [metadataField, setMetadataField] = useState(
    initialQuery.customField ?? "",
  );
  const router = useRouter();
  const pathname = usePathname();
  useRememberedWorkspace(initialData.actor.email, "board");
  const [documentsForProject, setDocumentsForProject] = useState<string | null>(
    null,
  );
  const [preloadedDetail, setPreloadedDetail] = useState(initialProjectDetail);
  const [data, setData] = useState(initialData),
    [query, setQuery] = useState(initialQuery),
    [section, setSection] = useState(initialSection),
    [view, setView] = useState(
      initialSection === "projects" ? "table" : "timeline",
    ),
    [expanded, setExpanded] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(initialProjectId ?? null),
    [editor, setEditor] = useState<BoardProject | "new" | null>(null),
    [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (location.pathname.includes("/projects/")) return;
    const url = new URL(location.href);
    if (selected) url.searchParams.set("project", selected);
    else {
      url.searchParams.delete("project");
      url.searchParams.delete("projectTab");
    }
    history.replaceState(history.state, "", url);
  }, [selected]);
  const [collapsePending, setCollapsePending] = useState<boolean | null>(null);
  const navigationCollapsed =
    collapsePending ?? data.profile.preferences.sidebarCollapsed;
  const [navigationSaving, setNavigationSaving] = useState(false);
  useWorkspaceAppearance(data.profile.preferences, data.settings);
  async function toggleNavigation() {
    if (navigationSaving) return;
    setNavigationSaving(true);
    setCollapsePending(!navigationCollapsed);
    try {
      const { version, ...fields } = data.profile;
      const response = await fetch("/api/workspace/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateProfile",
          version,
          ...fields,
          preferences: {
            ...fields.preferences,
            sidebarCollapsed: !navigationCollapsed,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Navigation preference could not be saved.",
        );
      setData((current) => ({ ...current, profile: result.profile }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setNavigationSaving(false);
      setCollapsePending(null);
    }
  }
  const sectionRef = useRef(initialSection);
  const fetchedQuery = useRef(parameters(initialQuery).toString());
  const serial = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const pathname = location.pathname;
    if (
      !mounted.current ||
      !(
        pathname === "/board-room" ||
        pathname.startsWith("/board-room/projects/")
      )
    )
      return;
    const seq = ++serial.current;
    const currentQuery = queryRef.current;
    setBusy(true);
    try {
      const next = await boardGet<BoardSnapshot>(
        parameters(currentQuery),
        signal,
      );
      if (
        mounted.current &&
        pathname === location.pathname &&
        seq === serial.current &&
        parameters(currentQuery).toString() ===
          parameters(queryRef.current).toString()
      ) {
        fetchedQuery.current = parameters(currentQuery).toString();
        setData((current) => {
          // A query snapshot may predate a completed preference/settings save.
          const keepProfile = current.profile.version > next.profile.version;
          return {
            ...next,
            profile: keepProfile ? current.profile : next.profile,
            actor: keepProfile
              ? {
                  ...next.actor,
                  name: current.actor.name,
                  image: current.actor.image,
                }
              : next.actor,
            settings:
              current.settings.version > next.settings.version
                ? current.settings
                : next.settings,
          };
        });
        setError("");
        const routeParameters = parameters(currentQuery);
        routeParameters.set("section", sectionRef.current);
        const visible = new URLSearchParams(location.search);
        preserveBoardContext(routeParameters, visible);
        window.history.replaceState(
          history.state,
          "",
          `${pathname}?${routeParameters}`,
        );
      }
    } catch (e) {
      if (
        mounted.current &&
        pathname === location.pathname &&
        (e as Error).name !== "AbortError" &&
        seq === serial.current
      )
        setError((e as Error).message);
    } finally {
      if (mounted.current && seq === serial.current) setBusy(false);
    }
  }, []);
  const liveState = useWorkspaceLive(() => {
    void refresh();
  }, initialData.revision ?? 0);
  useEffect(() => {
    const routeParameters = parameters(query);
    const signature = routeParameters.toString();
    routeParameters.set("section", sectionRef.current);
    preserveBoardContext(routeParameters, new URLSearchParams(location.search));
    history.replaceState(
      history.state,
      "",
      `${location.pathname}?${routeParameters}`,
    );
    if (signature === fetchedQuery.current) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void refresh(controller.signal);
    }, 150);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [refresh, query]);
  useEffect(() => {
    const listener = () => {
      try {
        const destination =
          new URLSearchParams(window.location.search).get("section") ||
          "overview";
        const nextSection = [
          ...sections.map((s) => s.id),
          "people",
          "activity",
          "files",
          "preferences",
          "templates",
        ].includes(destination)
          ? destination
          : "overview";
        sectionRef.current = nextSection;
        setSection(nextSection);
        setExpanded(null);
        if (nextSection === "projects") setView("table");
        if (nextSection === "overview") setView("timeline");
        const restoredQuery = querySchema.parse(
          Object.fromEntries(new URLSearchParams(window.location.search)),
        );
        setQuery(restoredQuery);
        setMetadataField(restoredQuery.customField ?? "");
      } catch {
        setQuery(EMPTY_QUERY);
      }
    };
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  function filter(patch: Partial<BoardQuery>) {
    setQuery((q) => chartQuery(q, patch));
  }
  function navigate(id: string) {
    if (id === sectionRef.current) return;
    templateNavigation.navigate(() => {
      sectionRef.current = id;
      setSection(id);
      const routeParameters = parameters(queryRef.current);
      routeParameters.set("section", id);
      templateNavigation.push(`${window.location.pathname}?${routeParameters}`);
      if (id === "projects") setView("table");
      if (id === "overview") setView("timeline");
      setExpanded(null);
    });
  }
  async function progress(
    p: BoardProject,
    stage: number,
    completed = false,
    reason?: string,
  ) {
    if (p.stage === stage && p.completed === completed) return;
    try {
      const result = await boardRequest<{ project: BoardProject }>({
        action: "progress",
        id: p.id,
        version: p.version,
        stage,
        completed,
        reason,
      });
      await refresh();
      toast.success("Project progress saved", {
        action:
          selected === p.id
            ? undefined
            : {
                label: "Undo",
                onClick: () => {
                  void boardRequest({
                    action: "progress",
                    id: p.id,
                    version: result.project.version,
                    stage: p.stage,
                    completed: p.completed,
                    reason: "Undo previous stage change.",
                  })
                    .then(() => refresh())
                    .then(() => toast.success("Progress restored"))
                    .catch((e) => {
                      toast.error(e.message);
                      void refresh();
                    });
                },
              },
      });
      return result.project;
    } catch (e) {
      toast.error((e as Error).message);
      await refresh();
    }
  }
  const admin = data.actor.isAdmin,
    summary = data.summary;
  const existingYears = summary.years.flatMap((y) =>
    y.year === null ? [] : [y.year],
  );
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
    }).format(new Date()),
  );
  const min = Math.min(currentYear, ...existingYears),
    max = Math.max(currentYear + 7, ...existingYears);
  const years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const timelineYears =
    query.year && query.year !== "unknown"
      ? [Number(query.year)]
      : Array.from(
          {
            length: (summary.rangeEnd ?? max) - (summary.rangeStart ?? min) + 1,
          },
          (_, i) => (summary.rangeStart ?? min) + i,
        );
  const activeFilters =
    query.search ||
    query.category ||
    query.attention ||
    query.stage ||
    query.year ||
    query.validation ||
    query.region ||
    query.location ||
    query.missingLocation ||
    query.unit ||
    query.assetCoverage ||
    query.customField ||
    query.customOption;
  const yearly = (
    <section
      className="br-year-summary"
      aria-label="Projects by planned COD year"
    >
      <div className="br-summary-label">
        <b>Planned COD by year</b>
        <small>Other filters apply · Select a year to focus</small>
      </div>
      <div className="br-year-grid">
        {[
          ...years,
          ...(summary.years.some((y) => y.year === null) ? [null] : []),
        ].map((year) => {
          const y = summary.years.find((y) => y.year === year);
          const key = year === null ? "unknown" : String(year);
          return (
            <button
              key={key}
              className={`br-year ${query.year === key ? "selected" : ""}`}
              aria-pressed={query.year === key}
              aria-label={`${year ?? "COD not set"}: ${y?.total ?? 0} projects`}
              onClick={() => filter({ year: query.year === key ? "" : key })}
            >
              <span>{year ?? "COD not set"}</span>
              <strong>{y?.total ?? 0}</strong>
              <small>projects</small>
              <div className="br-year-categories">
                {[
                  ...PRIMARY_CATEGORIES,
                  ...(summary.years.some(
                    (y) => (y.categories.Uncategorized ?? 0) > 0,
                  )
                    ? ["Uncategorized"]
                    : []),
                ].map((c) => (
                  <div key={c}>
                    <i style={{ background: colors[c] ?? "#718465" }} />
                    <span>{c}</span>
                    <b>{y?.categories[c] ?? 0}</b>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
  const stageCounts = (
    <section
      className="br-stage-summary"
      aria-label="Projects by current stage"
    >
      <div className="br-summary-label">
        <b>
          Projects by stage{" "}
          <small>Current position across the filtered portfolio</small>
        </b>
        <button
          className="br-text"
          aria-pressed={query.stage === "0"}
          onClick={() => filter({ stage: query.stage === "0" ? "" : "0" })}
        >
          {summary.stages[0]} not started
        </button>
      </div>
      <div className="br-stage-counts">
        {data.config.stages.map((s, i) => (
          <button
            className={query.stage === String(i + 1) ? "selected" : ""}
            key={i}
            aria-pressed={query.stage === String(i + 1)}
            onClick={() =>
              filter({
                stage: query.stage === String(i + 1) ? "" : String(i + 1),
              })
            }
          >
            <small>Stage {i + 1}</small>
            <strong>{summary.stages[i + 1]}</strong>
            <span title={s}>{s === `Stage ${i + 1}` ? "projects" : s}</span>
            <span className="br-stage-meter" aria-hidden="true">
              <i
                style={{
                  width: `${(summary.stages[i + 1] / Math.max(1, ...summary.stages.slice(1))) * 100}%`,
                }}
              />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
  const filters = (
    <div className="br-filters">
      <label className="br-search">
        <Search size={14} />
        <input
          aria-label="Search projects"
          type="search"
          placeholder="Search projects…"
          value={query.search}
          onChange={(e) => filter({ search: e.target.value })}
        />
      </label>
      <AppSelect
        aria-label="Primary category filter"
        value={query.category}
        onValueChange={(value) =>
          filter({ category: value as BoardQuery["category"] })
        }
      >
        <option value="">All categories</option>
        <option value="uncategorized">Uncategorized</option>
        {PRIMARY_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </AppSelect>
      {!!template.data?.definition.fields.length && (
        <>
          <AppSelect
            aria-label="Custom metadata field filter"
            value={metadataField}
            onValueChange={(value) => {
              setMetadataField(value);
              filter({ customField: "", customOption: "" });
            }}
          >
            <option value="">Custom metadata</option>
            {template.data.definition.fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {!f.active ? " (inactive)" : ""}
              </option>
            ))}
          </AppSelect>
          {metadataField && (
            <AppSelect
              aria-label="Custom metadata option filter"
              value={query.customOption ?? ""}
              onValueChange={(value) =>
                filter({
                  customField: value ? metadataField : "",
                  customOption: value,
                })
              }
            >
              <option value="">All options</option>
              {template.data.definition.fields
                .find((f) => f.key === metadataField)
                ?.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {!o.active ? " (inactive)" : ""}
                  </option>
                ))}
            </AppSelect>
          )}
        </>
      )}
      <AppSelect
        aria-label="Document status filter"
        value={query.validation}
        onValueChange={(value) =>
          filter({ validation: value as BoardQuery["validation"] })
        }
      >
        <option value="">All document statuses</option>
        <option value="valid">Valid</option>
        <option value="review">Needs review</option>
        <option value="none">No files</option>
      </AppSelect>
      <AppSelect
        aria-label="Project attention filter"
        value={query.attention || ""}
        onValueChange={(value) =>
          filter({ attention: value as BoardQuery["attention"] })
        }
      >
        <option value="">All project attention</option>
        <option value="stale">Progress review due</option>
        <option value="incomplete">Missing project information</option>
        <option value="unassigned">No responsible contact</option>
      </AppSelect>
      {["overview", "projects", "documents", "reports", "map"].includes(
        section,
      ) && (
        <BoardSavedViews
          filters={boardViewFiltersSchema.parse({
            query,
            section: [
              "overview",
              "projects",
              "documents",
              "reports",
              "map",
            ].includes(section)
              ? section
              : "overview",
            view,
          })}
          onApply={(saved) => {
            sectionRef.current = saved.section;
            setSection(saved.section);
            setView(saved.view);
            setExpanded(null);
            const nextQuery = { ...saved.query, page: 1 };
            setQuery(nextQuery);
            setMetadataField(nextQuery.customField ?? "");
            const nextParameters = parameters(nextQuery);
            nextParameters.set("section", saved.section);
            window.history.replaceState(
              history.state,
              "",
              `/board-room?${nextParameters}`,
            );
          }}
        />
      )}
      {activeFilters && (
        <button
          className="br-text"
          onClick={() => {
            setQuery(EMPTY_QUERY);
            setMetadataField("");
          }}
        >
          Clear filters
        </button>
      )}
      <small className="br-result-count">
        {summary.total.toLocaleString("en-US")} of{" "}
        {summary.allTotal.toLocaleString("en-US")} projects
      </small>
    </div>
  );
  const charts = (
    <>
      <DashboardCharts
        snapshot={data}
        query={query}
        onQueryChange={(q) => filter(q)}
      />
      <RegionalMap
        data={data.analytics.regions}
        query={query}
        onQueryChange={(q) => filter(q)}
      />
    </>
  );
  const pagination = (
    <div className="br-pagination">
      <small>
        Showing{" "}
        {data.projects.length
          ? ((data.page - 1) * data.pageSize + 1).toLocaleString("en-US")
          : 0}
        –
        {Math.min(data.page * data.pageSize, summary.total).toLocaleString(
          "en-US",
        )}{" "}
        of {summary.total.toLocaleString("en-US")}
      </small>
      <div>
        <button
          disabled={busy || query.page <= 1}
          onClick={() => setQuery({ ...query, page: query.page - 1 })}
        >
          Previous
        </button>
        <span>Page {query.page}</span>
        <button
          disabled={busy || query.page * data.pageSize >= summary.total}
          onClick={() => setQuery({ ...query, page: query.page + 1 })}
        >
          Next
        </button>
      </div>
    </div>
  );
  const timeline = (
    <section className="br-panel">
      <div className="br-panel-heading br-heading-row">
        <div>
          <h2>Portfolio timeline</h2>
          <p>
            {query.year
              ? query.year === "unknown"
                ? "COD not set"
                : `${query.year} focus`
              : `${min}–${max}`}{" "}
            · Ordered by planned COD
          </p>
        </div>
        <div className="br-year-controls">
          <button onClick={() => filter({ year: "" })}>All years</button>
          <AppSelect
            aria-label="Focus COD year"
            value={query.year}
            onValueChange={(value) => filter({ year: value })}
          >
            <option value="">Focus year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            {summary.years.some((y) => y.year === null) && (
              <option value="unknown">COD not set</option>
            )}
          </AppSelect>
        </div>
      </div>
      <div className="br-timeline-scroll">
        <div
          className="br-timeline-grid"
          style={
            {
              "--years": timelineYears.length,
              minWidth: Math.max(790, 248 + timelineYears.length * 70),
            } as React.CSSProperties
          }
        >
          <div className="br-time-header">
            <span>Project</span>
            <div>
              {timelineYears.map((y) => (
                <button key={y} onClick={() => filter({ year: String(y) })}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          {data.projects.map((p) => {
            const start = Math.max(
                timelineYears[0],
                p.startYear ?? p.codYear ?? timelineYears[0],
              ),
              left = ((start - timelineYears[0]) / timelineYears.length) * 100,
              width =
                (((p.codYear ?? start) - start + 1) / timelineYears.length) *
                100;
            return (
              <div key={p.id}>
                <div
                  className={`br-project-row ${expanded === p.id ? "open" : ""}`}
                >
                  <button
                    className="br-project-name"
                    aria-expanded={expanded === p.id}
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  >
                    <ChevronRight size={11} />
                    <span>
                      <b>{p.name}</b>
                      <small>
                        <i
                          style={{
                            background: colors[p.category] ?? "#718465",
                          }}
                        />
                        {p.category || "Uncategorized"} · {p.location}
                      </small>
                    </span>
                    {p.valid && (
                      <Check size={12} aria-label="Documents valid" />
                    )}
                  </button>
                  <div className="br-schedule">
                    {p.codYear === null ? (
                      <span className="br-unscheduled">COD not set</span>
                    ) : (
                      <button
                        style={
                          {
                            left: `calc(${left}% + 6px)`,
                            width: `calc(${width}% - 12px)`,
                            "--project-color": colors[p.category] ?? "#718465",
                          } as React.CSSProperties
                        }
                        className="br-range"
                        onClick={() =>
                          setExpanded(expanded === p.id ? null : p.id)
                        }
                        aria-label={`${p.name}: planned COD ${p.codYear}, stage ${p.stage}`}
                      >
                        <span>
                          <Capacity p={p} /> /{" "}
                          {p.completed
                            ? "Completed"
                            : p.stage
                              ? `Stage ${p.stage}`
                              : "Not started"}
                        </span>
                        <i />
                      </button>
                    )}
                  </div>
                </div>
                {expanded === p.id && (
                  <div className="br-inline-detail">
                    <div className="br-inline-info">
                      <span>
                        <small>Capacity</small>
                        <b>
                          <Capacity p={p} />
                        </b>
                      </span>
                      <span>
                        <small>Planned years</small>
                        <b>
                          {p.startYear ?? "—"}–{p.codYear ?? "Not set"}
                        </b>
                      </span>

                      <span>
                        <small>Voltage</small>
                        <b>{p.voltage || "Not set"}</b>
                      </span>
                      <button onClick={() => setSelected(p.id)}>
                        <FileText size={13} /> Project details{" "}
                        <ArrowUpRight size={12} />
                      </button>
                    </div>
                    <StageTrack
                      project={p}
                      stages={data.config.stages}
                      admin={admin}
                      onChange={progress}
                    />
                    <div className="br-inline-info">
                      <span
                        className="br-status"
                        data-state={documentStatus(p)}
                      >
                        {p.valid ? "✓ " : ""}
                        {documentStatus(p)}
                      </span>
                      <small>{p.fileCount} documents</small>
                      {p.links.map((url, i) => (
                        <a
                          key={`${url}-${i}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {p.linkLabels?.[i] || `Project link ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!data.projects.length && (
            <div className="br-empty">
              No projects match this view.{" "}
              {activeFilters
                ? "Clear a filter to see more projects."
                : admin
                  ? "Import CSV or add a project to get started."
                  : "The administrator can add projects."}
            </div>
          )}
        </div>
      </div>
      {pagination}
    </section>
  );
  const register = (
    <section className="br-panel">
      <div className="br-panel-heading br-heading-row">
        <div>
          <h2>
            {section === "documents" ? "Project documents" : "Project register"}
          </h2>
          <p>
            {section === "documents"
              ? "Select a project to review or download its private documents"
              : "Sort and explore the detail behind the portfolio"}
          </p>
        </div>
        <a
          href={`/api/board-room?${parameters(query)}&export=csv`}
          className="br-text"
        >
          Export filtered CSV
        </a>
      </div>
      <div className="br-table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                <button
                  onClick={() =>
                    filter({
                      sort: "name",
                      direction:
                        query.sort === "name" && query.direction === "asc"
                          ? "desc"
                          : "asc",
                    })
                  }
                >
                  Project ↕
                </button>
              </th>
              <th>Category</th>
              <th>Voltage</th>
              <th>
                <button
                  onClick={() =>
                    filter({
                      sort: "capacity",
                      direction:
                        query.sort === "capacity" && query.direction === "asc"
                          ? "desc"
                          : "asc",
                    })
                  }
                >
                  Capacity ↕
                </button>
              </th>
              <th>
                <button
                  onClick={() =>
                    filter({
                      sort: "cod",
                      direction:
                        query.sort === "cod" && query.direction === "asc"
                          ? "desc"
                          : "asc",
                    })
                  }
                >
                  COD ↕
                </button>
              </th>
              <th>Stage</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="br-project-link"
                    onClick={() => setSelected(p.id)}
                  >
                    {p.name}
                  </button>
                  <small className="br-project-id">{p.externalId}</small>
                </td>
                <td>
                  <span className="br-category-label">
                    <i
                      style={{ background: colors[p.category] ?? "#718465" }}
                    />
                    {p.category || "Uncategorized"}
                  </span>
                </td>
                <td className="br-voltage-cell">{p.voltage || "Not set"}</td>
                <td>
                  <Capacity p={p} />
                </td>
                <td>{p.codYear ?? "Not set"}</td>
                <td>
                  <span className="br-stage-chip">
                    {p.completed
                      ? "Completed"
                      : p.stage
                        ? `${String(p.stage).padStart(2, "0")} ${data.config.stages[p.stage - 1]}`
                        : "Not started"}
                  </span>
                </td>
                <td>
                  <button onClick={() => setSelected(p.id)}>
                    <span className="br-status" data-state={documentStatus(p)}>
                      {p.valid ? "✓ " : ""}
                      {documentStatus(p)}
                    </span>
                    <small> {p.fileCount} files</small>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.projects.length && (
          <div className="br-empty">
            No projects found. Adjust filters or add a project.
          </div>
        )}
      </div>
      {pagination}
    </section>
  );
  return (
    <div
      className={`br${navigationCollapsed ? " br-navigation-collapsed" : ""}`}
      {...experienceAttributes(data.profile.preferences, data.settings)}
    >
      <BoardNavigation
        sections={sections.filter((s) => s.id !== "project-template" || admin)}
        section={section}
        onNavigate={navigate}
        actor={data.actor}
        profile={data.profile}
        onProfileChanged={(profile) =>
          setData((current) => ({ ...current, profile }))
        }
        onNewProject={() => setEditor("new")}
        onQuickFind={() => {
          navigate("projects");
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLInputElement>(".br-search input")
              ?.focus(),
          );
        }}
        admin={admin}
        total={summary.allTotal}
        collapsed={navigationCollapsed}
        saving={navigationSaving}
        onCollapse={() => void toggleNavigation()}
      />
      <main className="br-main">
        <div className="br-topbar">
          <span>
            Workspace / Board Room /{" "}
            {sections.find((s) => s.id === section)?.label ??
              {
                people: "People",
                activity: "Activity",
                files: "Files",
                preferences: "Settings",
                templates: "Import & Workflow Guides",
              }[section]}
          </span>
          <button
            onClick={() => void refresh()}
            title={liveState}
            aria-label="Refresh Board Room"
            disabled={busy}
          >
            <RefreshCw size={13} />
            {busy ? "Updating…" : "Refresh"}
          </button>
        </div>
        <div className="br-content">
          <div className="br-title-row">
            <div>
              <h1>
                {[
                  "assets",
                  "connections",
                  "quality",
                  "map",
                  "storyline",
                  "costs",
                  "project-template",
                ].includes(section)
                  ? sections.find((s) => s.id === section)?.label
                  : section === "overview" || section === "projects"
                    ? BOARD_TITLE
                    : section === "database"
                      ? "Project database"
                      : section === "documents"
                        ? "Project documents"
                        : section === "reports"
                          ? "Portfolio reports"
                          : section === "people"
                            ? "Workspace people"
                            : section === "activity"
                              ? "Board Room activity"
                              : section === "files"
                                ? "Board Room files"
                                : section === "preferences"
                                  ? "Board Room settings"
                                  : section === "templates"
                                    ? "Import & Workflow Guides"
                                    : "Board Room workflow"}
              </h1>
              <p>
                {summary.allTotal.toLocaleString("en-US")} shared projects ·
                Ten-stage workflow · Stages are not physical completion
                percentages
              </p>
            </div>
            {admin &&
              ![
                "people",
                "activity",
                "files",
                "preferences",
                "templates",
              ].includes(section) && (
                <div>
                  <button onClick={() => setEditor("new")}>
                    <Plus size={13} />
                    Add project
                  </button>
                  <button
                    className="br-primary"
                    onClick={() => setImporting(true)}
                  >
                    <Upload size={13} />
                    Import projects
                  </button>
                </div>
              )}
          </div>
          {error && (
            <div className="br-error" role="alert">
              {error}
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {(section === "overview" ||
            section === "projects" ||
            section === "reports") && (
            <>
              <div
                className="br-attention-strip"
                aria-label="Project attention shortcuts"
              >
                <span>Focus on</span>
                <button
                  aria-pressed={query.attention === "stale"}
                  onClick={() =>
                    filter({
                      attention: query.attention === "stale" ? "" : "stale",
                    })
                  }
                >
                  Progress reviews due
                </button>
                <button
                  aria-pressed={query.attention === "incomplete"}
                  onClick={() =>
                    filter({
                      attention:
                        query.attention === "incomplete" ? "" : "incomplete",
                    })
                  }
                >
                  Missing information
                </button>
                <button
                  aria-pressed={query.attention === "unassigned"}
                  onClick={() =>
                    filter({
                      attention:
                        query.attention === "unassigned" ? "" : "unassigned",
                    })
                  }
                >
                  Unassigned contacts
                </button>
              </div>
              {filters}
              <div className="dashboard-active-filters">
                {query.region && (
                  <button onClick={() => filter({ region: "" })}>
                    Region: {query.region} ×
                  </button>
                )}
                {query.location && (
                  <button onClick={() => filter({ location: "" })}>
                    Location: {query.location} ×
                  </button>
                )}
                {query.missingLocation && (
                  <button onClick={() => filter({ missingLocation: false })}>
                    Unspecified location ×
                  </button>
                )}
                {query.unit && (
                  <button onClick={() => filter({ unit: "" })}>
                    Unit: {query.unit} ×
                  </button>
                )}
                {query.assetCoverage && (
                  <button onClick={() => filter({ assetCoverage: "" })}>
                    Assets: {query.assetCoverage} ×
                  </button>
                )}
              </div>
              {stageCounts}
              {yearly}
            </>
          )}
          {section === "storyline" && <StorylineWorkspace admin={admin} />}
          {section === "costs" && <CostsWorkspace admin={admin} />}
          {section === "project-template" &&
            (admin ? (
              <ProjectTemplateManager actorEmail={data.actor.email} />
            ) : (
              <p role="alert">
                Project template management is available to administrators.
              </p>
            ))}
          {section === "map" && (
            <>
              {filters}
              <RegionalMap
                data={data.analytics.regions}
                query={query}
                onQueryChange={filter}
              />
              {register}
            </>
          )}
          {section === "assets" && (
            <AssetsWorkspace
              email={data.actor.email}
              admin={data.actor.isAdmin}
            />
          )}
          {section === "connections" && (
            <ProjectAssetMap stages={data.config.stages} />
          )}
          {section === "quality" &&
            (data.actor.isAdmin ? (
              <QualityWorkspace />
            ) : (
              <p>Data quality management is available to administrators.</p>
            ))}
          {section === "database" && (
            <>
              <section className="br-panel br-upload-panel">
                <Upload size={25} />
                <h2>Bring your project list into view</h2>
                <p>
                  Upload → map columns → preview changes → merge by Project ID
                </p>
                <div>
                  {admin && (
                    <button
                      className="br-primary"
                      onClick={() => setImporting(true)}
                    >
                      Choose project CSV
                    </button>
                  )}
                  <a href="/board-room/project-upload-template.csv" download>
                    Blank CSV template
                  </a>
                  <a href="/board-room/project-upload-example.csv" download>
                    Example CSV
                  </a>
                </div>
                <small>
                  Year-only schedules · Numeric capacity + unit · Assets and
                  voltage fields
                </small>
              </section>
              <ProjectCSVGuide />
              <ImportHistory revision={data.config.revision} />
              {filters}
            </>
          )}
          {(
            ["people", "activity", "files", "preferences", "templates"] as const
          ).map(
            (managementSection) =>
              section === managementSection && (
                <WorkspaceManagementPanel
                  experience={data}
                  key={managementSection}
                  section={managementSection}
                  onChanged={refresh}
                  onProject={setSelected}
                  onNavigate={navigate}
                  onLogout={() => {
                    void fetch("/api/auth/sign-out", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: "{}",
                    })
                      .then((r) => {
                        if (r.ok) {
                          clearBrowserDrafts();
                          clearTaskDrafts(data.actor.email, false);
                          clearProjectDrafts(data.actor.email, false);
                          router.push("/");
                          router.refresh();
                        } else toast.error("Couldn’t sign out. Try again.");
                      })
                      .catch(() =>
                        toast.error("Couldn’t sign out. Try again."),
                      );
                  }}
                />
              ),
          )}
          {section === "documents" && filters}
          {["overview", "projects"].includes(section) && (
            <>
              <div className="br-workspace-bar">
                <div className="br-view-switch">
                  <button
                    className={view === "timeline" ? "active" : ""}
                    aria-pressed={view === "timeline"}
                    onClick={() => setView("timeline")}
                  >
                    <LayoutDashboard size={12} />
                    Timeline
                  </button>
                  <button
                    className={view === "table" ? "active" : ""}
                    aria-pressed={view === "table"}
                    onClick={() => setView("table")}
                  >
                    <Table2 size={12} />
                    Table
                  </button>
                </div>
                <small>
                  {summary.valid} valid / {summary.total} projects · Counts
                  reflect active filters
                </small>
              </div>
              <div
                className="br-portfolio-layout dashboard-timeline"
                aria-busy={busy}
              >
                <div>{view === "timeline" ? timeline : register}</div>
              </div>
              {section === "overview" && (
                <>
                  {section === "overview" && (
                    <DashboardSummary
                      snapshot={data}
                      query={query}
                      onQueryChange={(q) => filter(q)}
                    />
                  )}
                  {charts}
                  <ProjectAssetMap
                    overviewQuery={query}
                    stages={data.config.stages}
                  />
                </>
              )}
            </>
          )}
          {["database", "documents"].includes(section) && register}
          {section === "reports" && (
            <>
              <PortfolioReport query={query} />
              {charts}
            </>
          )}
          {section === "settings" && (
            <p className="br-shared-settings-link">
              {admin && (
                <button
                  className="br-text"
                  onClick={() => navigate("project-template")}
                >
                  Project Fields
                </button>
              )}
              Manage your profile, appearance and Board Room files.{" "}
              <button
                className="br-text"
                onClick={() => navigate("preferences")}
              >
                Open Board Room settings
              </button>
            </p>
          )}
          {section === "settings" && (
            <StageSettings
              config={data.config}
              admin={admin}
              onSaved={refresh}
            />
          )}
          <div className="br-footer">
            Board Room · Kalimantan power system project monitoring{" "}
            <span>
              {busy
                ? "Updating shared data…"
                : liveState === "Live"
                  ? "Live shared data"
                  : liveState}
            </span>
          </div>
        </div>
      </main>
      {importing && admin && (
        <ImportDialog
          actorEmail={data.actor.email}
          onClose={() => setImporting(false)}
          onSaved={() => {
            setImporting(false);
            void refresh();
          }}
        />
      )}
      {editor && admin && (
        <ProjectForm
          actorEmail={data.actor.email}
          project={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={(p) => {
            if (editor === "new") setDocumentsForProject(p.id);
            setEditor(null);
            setSelected(p.id);
            void refresh();
          }}
        />
      )}
      {selected && !editor && (
        <ProjectDetail
          showTasks={section !== "overview" || pathname.includes("/projects/")}
          initialTab={
            documentsForProject === selected ? "documents" : initialProjectTab
          }
          key={selected}
          revision={data.config.revision}
          id={selected}
          initialDetail={
            preloadedDetail?.project.id === selected
              ? preloadedDetail
              : undefined
          }
          admin={admin}
          stages={data.config.stages}
          onClose={() => {
            setPreloadedDetail(undefined);
            setDocumentsForProject(null);
            setSelected(null);
            if (initialProjectId)
              window.history.replaceState(
                history.state,
                "",
                `/board-room?${parameters(query)}`,
              );
          }}
          onEdit={(p) => {
            setPreloadedDetail(undefined);
            setEditor(p);
          }}
          onChanged={refresh}
          onProgress={progress}
        />
      )}
    </div>
  );
}

export function BoardRoom(props: Parameters<typeof BoardRoomContent>[0]) {
  return (
    <TemplateNavigationProvider>
      <BoardRoomContent {...props} />
    </TemplateNavigationProvider>
  );
}
