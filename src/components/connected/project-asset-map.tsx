"use client";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { Maximize2, Minus, Plus, Scan } from "lucide-react";
import { useConnectedData } from "./data";
import { useURLState } from "./url-state";
import { AppSelect } from "../app-select";
import {
  PRIMARY_CATEGORIES,
  type BoardQuery,
  type BoardDetail,
} from "@/lib/board-room/model";
import type { assetConnections } from "@/lib/assets/explore";
import type { Asset } from "@/lib/assets/model";
import { zoomMapAt } from "@/lib/project-asset-camera";
import {
  boundedProjectNodes,
  layoutProjectAssets,
} from "@/lib/project-asset-layout";
type Node = {
  id: string;
  parentId: string | null;
  name: string;
  category: string;
  code?: string;
  assetCount?: number;
};
const colors: Record<string, string> = {
  Pembangkit: "#49795c",
  Transmisi: "#7d68bd",
  "Gardu Induk": "#b77740",
};
function ProjectSelection({ id, stages }: { id: string; stages?: string[] }) {
  const r = useConnectedData<BoardDetail>(
    "/api/board-room?id=" + encodeURIComponent(id),
  );
  return (
    <>
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {r.data ? (
        <>
          <dl>
            <dt>Stage</dt>
            <dd>
              {r.data.project.stage
                ? (stages?.[r.data.project.stage - 1] ??
                  `Stage ${r.data.project.stage}`)
                : "Not started"}
            </dd>
            <dt>Planned COD</dt>
            <dd>{r.data.project.codYear ?? "Unscheduled"}</dd>
            <dt>Category</dt>
            <dd>{r.data.project.category || "Uncategorized"}</dd>
            <dt>Documents</dt>
            <dd>
              {r.data.attachments.length} ·{" "}
              {r.data.project.valid
                ? "Valid"
                : r.data.attachments.length
                  ? "Needs review"
                  : "No files"}
            </dd>
          </dl>
          <Link href={`/board-room/projects/${id}?projectTab=assets`}>
            View assets
          </Link>
          <Link href={`/board-room/projects/${id}?projectTab=documents`}>
            View documents
          </Link>
        </>
      ) : (
        <p role="status">Loading project details…</p>
      )}
    </>
  );
}
function AssetSelection({ id }: { id: string }) {
  const r = useConnectedData<{ items: Asset[] }>(
    "/api/board-room/assets?id=" + encodeURIComponent(id),
  );
  const a = r.data?.items[0];
  return (
    <>
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      {a ? (
        <>
          <dl>
            <dt>RUPTL code</dt>
            <dd>{a.code}</dd>
            <dt>Capacity</dt>
            <dd>
              {a.capacity === null ? "Not set" : `${a.capacity} ${a.unit}`}
            </dd>
            <dt>Location</dt>
            <dd>{a.location || "Not set"}</dd>
            <dt>Voltage</dt>
            <dd>{a.voltage || "Not set"}</dd>
          </dl>
          <Link href={"/board-room?section=assets&asset=" + a.id}>
            Open asset
          </Link>
        </>
      ) : (
        <p role="status">Loading asset details…</p>
      )}
    </>
  );
}
export function ProjectAssetMap({
  overviewQuery,
  stages,
}: {
  overviewQuery?: BoardQuery;
  stages?: string[];
}) {
  const [filters, setFilters] = useURLState(
    "networkFilters",
    {
      q: "",
      year: "",
      category: "",
      assetCategory: "",
      location: "",
      voltage: "",
    },
    (v) =>
      !!v &&
      typeof v === "object" &&
      ["q", "year", "category", "assetCategory", "location", "voltage"].every(
        (k) => typeof (v as Record<string, unknown>)[k] === "string",
      ),
  );
  const [page, setPage] = useURLState("networkPage", 1),
    [childPage, setChildPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [expandedRoot, setExpandedRoot] = useState<string | null>(null),
    [list, setList] = useState(false),
    [explore, setExplore] = useState(false),
    [viewCamera, updateCamera] = useState<{
      x: number;
      y: number;
      k: number;
    } | null>(null),
    [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({});
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const container = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    fullButton = useRef<HTMLButtonElement>(null),
    drag = useRef<{
      id: string | null;
      x: number;
      y: number;
      moved: boolean;
    } | null>(null);
  const parameters = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  );
  parameters.set("page", String(page));
  if (overviewQuery) parameters.set("overview", JSON.stringify(overviewQuery));
  const queryKey = parameters.toString();
  const r = useConnectedData<Awaited<ReturnType<typeof assetConnections>>>(
    "/api/board-room/connections?" + queryKey,
  );
  const [selectedScope, setSelectedScope] = useState(queryKey);
  const scopeChanged = selectedScope !== queryKey;
  const activeId = scopeChanged ? null : selected;
  const project = scopeChanged
    ? undefined
    : r.data?.projects.find((p) => p.id === expandedRoot);
  const unassigned = !scopeChanged && expandedRoot === "unassigned";
  const childParams = new URLSearchParams({
    projectId: unassigned ? "unassigned" : (project?.id ?? "unassigned"),
    page: String(childPage),
    limit: "100",
    category: filters.assetCategory,
    location: filters.location,
    voltage: filters.voltage,
  });
  const children = useConnectedData<{ items: Asset[]; total: number }>(
    project || unassigned ? "/api/board-room/assets?" + childParams : "",
  );
  const nodes = useMemo(() => {
    const roots: Node[] = (r.data?.projects ?? []).map((p) => ({
      ...p,
      parentId: null,
    }));
    if (!overviewQuery && (r.data?.unassigned ?? 0) > 0)
      roots.push({
        id: "unassigned",
        parentId: null,
        name: "Unassigned assets",
        category: "",
        assetCount: r.data!.unassigned,
      });
    const assets: Node[] = (r.data?.assets ?? [])
      .filter((a) => !project || a.projectId !== project.id)
      .map((a) => ({ ...a, parentId: a.projectId }));
    if (project || unassigned)
      assets.push(
        ...(children.data?.items ?? [])
          .filter((a) => a.projectId === (project?.id ?? null))
          .map((a) => ({ ...a, parentId: a.projectId ?? "unassigned" })),
      );
    return boundedProjectNodes(
      [...roots, ...assets],
      project?.id ?? (unassigned ? "unassigned" : undefined),
    );
  }, [r.data, children.data, project, unassigned, overviewQuery]);
  const coords = useMemo(
    () => layoutProjectAssets(nodes, positions),
    [nodes, positions],
  );
  const chosen = nodes.find((n) => n.id === activeId);
  function select(id: string) {
    setSelected(id);
    setSelectedScope(queryKey);
    const node = nodes.find((n) => n.id === id);
    if (node?.parentId === null) {
      setExpandedRoot(id);
      setChildPage(1);
    }
  }
  const points = Object.values(coords);
  const minX = points.length ? Math.min(...points.map((p) => p.x)) - 90 : 0,
    maxX = points.length ? Math.max(...points.map((p) => p.x)) + 90 : 900;
  const minY = points.length ? Math.min(...points.map((p) => p.y)) - 65 : 0,
    maxY = points.length ? Math.max(...points.map((p) => p.y)) + 65 : 360;
  const initialZoom = Math.min(1.5, 850 / (maxX - minX), 320 / (maxY - minY));
  const automaticCamera = {
    x: 450 - ((minX + maxX) / 2) * initialZoom,
    y: 180 - ((minY + maxY) / 2) * initialZoom,
    k: initialZoom,
  };
  const camera = viewCamera ?? automaticCamera;
  function setCamera(
    next: typeof camera | ((value: typeof camera) => typeof camera),
  ) {
    updateCamera((old) =>
      typeof next === "function" ? next(old ?? automaticCamera) : next,
    );
  }
  function fit() {
    if (!nodes.length) {
      setCamera({ x: 0, y: 0, k: 1 });
      return;
    }
    const points = Object.values(coords),
      minX = Math.min(...points.map((p) => p.x)) - 80,
      maxX = Math.max(...points.map((p) => p.x)) + 80,
      minY = Math.min(...points.map((p) => p.y)) - 60,
      maxY = Math.max(...points.map((p) => p.y)) + 60;
    const k = Math.min(2, 850 / (maxX - minX), 320 / (maxY - minY));
    setCamera({
      x: 450 - ((minX + maxX) / 2) * k,
      y: 180 - ((minY + maxY) / 2) * k,
      k,
    });
  }
  function zoom(factor: number) {
    setCamera((c) => zoomMapAt(c, { x: 450, y: 180 }, factor));
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch" && explore) {
      const before = [...touches.current.values()];
      if (touches.current.has(e.pointerId))
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = [...touches.current.values()];
      if (before.length === 2 && after.length === 2) {
        const distance = (p: { x: number; y: number }[]) =>
          Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const rect = e.currentTarget.getBoundingClientRect();
        const point = {
          x: (((after[0].x + after[1].x) / 2 - rect.left) * 900) / rect.width,
          y: (((after[0].y + after[1].y) / 2 - rect.top) * 360) / rect.height,
        };
        if (distance(before) > 0)
          setCamera((c) =>
            zoomMapAt(c, point, distance(after) / distance(before)),
          );
        drag.current = null;
        return;
      }
    }
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.x) * 900) / rect.width,
      dy = ((e.clientY - d.y) * 360) / rect.height;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.id) {
      const id = d.id;
      setPositions((p) => ({
        ...coords,
        ...p,
        [id]: {
          x: (p[id] ?? coords[id]).x + dx / camera.k,
          y: (p[id] ?? coords[id]).y + dy / camera.k,
        },
      }));
    } else setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  }
  function start(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch" && !explore) return;
    if (e.pointerType === "touch")
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const target = (e.target as Element).closest("[data-node]");
    drag.current = {
      id: target?.getAttribute("data-node") ?? null,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function end(e: PointerEvent<SVGSVGElement>) {
    touches.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.id && !d.moved) select(d.id);
    drag.current = null;
  }
  return (
    <section
      className="br-panel project-asset-map"
      aria-label="Project–asset map"
      ref={container}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setSelected(null);
          setExplore(false);
          if (document.fullscreenElement)
            void document
              .exitFullscreen()
              .then(() => fullButton.current?.focus());
        }
      }}
    >
      <div className="br-panel-heading">
        <h2>Project–asset connections</h2>
        <p>
          Recorded assignments · explore the technical records behind each
          project
        </p>
      </div>
      {!overviewQuery && (
        <div className="network-filters">
          <input
            aria-label="Search map projects"
            placeholder="Search projects…"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setPage(1);
            }}
          />
          <input
            aria-label="Map planned COD year"
            placeholder="COD year"
            type="number"
            min="1900"
            max="2200"
            value={filters.year}
            onChange={(e) => {
              setFilters({ ...filters, year: e.target.value });
              setPage(1);
            }}
          />
          {(["category", "assetCategory"] as const).map((key) => (
            <AppSelect
              key={key}
              aria-label={
                key === "category"
                  ? "Map project category"
                  : "Map asset category"
              }
              value={filters[key]}
              onValueChange={(v) => {
                setFilters({ ...filters, [key]: v });
                setPage(1);
              }}
            >
              <option value="">
                {key === "category"
                  ? "All project categories"
                  : "All asset categories"}
              </option>
              {PRIMARY_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </AppSelect>
          ))}
          {(["location", "voltage"] as const).map((key) => (
            <input
              key={key}
              aria-label={"Map asset " + key}
              placeholder={"Asset " + key}
              value={filters[key]}
              onChange={(e) => {
                setFilters({ ...filters, [key]: e.target.value });
                setPage(1);
              }}
            />
          ))}
        </div>
      )}
      <div className="network-toolbar">
        <button onClick={() => setList((v) => !v)} aria-pressed={list}>
          {list ? "Show map" : "Accessible list"}
        </button>
        <button aria-label="Zoom in map" onClick={() => zoom(1.2)}>
          <Plus size={16} />
        </button>
        <button aria-label="Zoom out map" onClick={() => zoom(1 / 1.2)}>
          <Minus size={16} />
        </button>
        <button onClick={fit}>
          <Scan size={16} /> Fit
        </button>
        <button
          onClick={() => {
            setPositions({});
            updateCamera(null);
          }}
        >
          Reset
        </button>
        <button
          ref={fullButton}
          aria-label="Fullscreen map"
          onClick={() => {
            if (document.fullscreenElement)
              void document
                .exitFullscreen()
                .then(() => fullButton.current?.focus());
            else void container.current?.requestFullscreen().catch(() => {});
          }}
        >
          <Maximize2 size={16} />
        </button>
        <button
          className="network-explore"
          aria-pressed={explore}
          onClick={() => setExplore((v) => !v)}
        >
          {explore ? "Exit exploration" : "Explore map"}
        </button>
      </div>
      {r.error && (
        <p role="alert">
          {r.error}
          <button onClick={r.retry}>Retry</button>
        </p>
      )}
      <p className="network-counts" role="status">
        {r.data
          ? `${r.data.total} matching projects · ${r.data.assetTotal} linked assets · ${nodes.length} nodes shown (maximum 250)`
          : "Loading connections…"}
        {r.busy && r.data ? " · Refreshing…" : ""}
      </p>
      {scopeChanged && selected && (
        <p className="br-note">
          Selection cleared because the filters changed.
        </p>
      )}
      <div className="network-layout">
        <div>
          {list ? (
            <ul className="network-list">
              {nodes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => select(n.id)}
                    aria-pressed={activeId === n.id}
                  >
                    {n.parentId ? "Asset: " : "Project: "}
                    {n.code ? `${n.code} — ` : ""}
                    {n.name}
                    {n.assetCount !== undefined
                      ? ` · ${n.assetCount} assets`
                      : ""}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <svg
              ref={svg}
              className={`network-canvas ${explore ? "exploring" : ""}`}
              viewBox="0 0 900 360"
              role="group"
              aria-label="Interactive project asset network"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={(e) => {
                touches.current.delete(e.pointerId);
                drag.current = null;
              }}
            >
              <g
                transform={`translate(${camera.x},${camera.y}) scale(${camera.k})`}
              >
                {nodes
                  .filter((n) => n.parentId && coords[n.parentId])
                  .map((n) => (
                    <line
                      key={"edge" + n.id}
                      x1={coords[n.parentId!].x}
                      y1={coords[n.parentId!].y}
                      x2={coords[n.id].x}
                      y2={coords[n.id].y}
                      className={
                        activeId === n.id || activeId === n.parentId
                          ? "selected"
                          : ""
                      }
                    />
                  ))}
                {nodes.map((n) => (
                  <g
                    key={n.id}
                    data-node={n.id}
                    transform={`translate(${coords[n.id].x},${coords[n.id].y})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${n.parentId ? "Asset" : "Project"} ${n.code ?? ""} ${n.name}`}
                    aria-pressed={activeId === n.id}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(n.id);
                      }
                    }}
                  >
                    <circle
                      r={n.parentId ? 7 : 17}
                      fill={colors[n.category] ?? "#718465"}
                      className={activeId === n.id ? "selected" : ""}
                    />
                    <text
                      y={n.parentId ? 22 : 35}
                      textAnchor="middle"
                      style={{ fontSize: `${13 / camera.k}px` }}
                    >
                      {(n.code ?? n.name).length > 28
                        ? (n.code ?? n.name).slice(0, 27) + "…"
                        : (n.code ?? n.name)}
                    </text>
                    <title>{n.name}</title>
                  </g>
                ))}
              </g>
            </svg>
          )}
          {!r.busy && r.data && !r.data.total && !r.data.unassigned && (
            <p className="br-note">
              No matching connections. Create projects and link assets in the
              database.
            </p>
          )}
          <div className="network-pagination">
            <button
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                setSelected(null);
              }}
            >
              Previous projects
            </button>
            <span>Page {page}</span>
            <button
              disabled={!r.data || page * 25 >= r.data.total}
              onClick={() => {
                setPage(page + 1);
                setSelected(null);
              }}
            >
              Next projects
            </button>
          </div>
        </div>
        {chosen && (
          <aside className="network-selection" aria-label="Selected record">
            <button onClick={() => setSelected(null)}>Close details</button>
            <h3>{chosen.name}</h3>
            {chosen.id === "unassigned" ? (
              <p>
                {r.data?.unassigned} unassigned assets across the portfolio.
              </p>
            ) : chosen.parentId ? (
              <AssetSelection key={chosen.id} id={chosen.id} />
            ) : (
              <ProjectSelection
                key={chosen.id}
                id={chosen.id}
                stages={stages}
              />
            )}{" "}
            {(project || unassigned) && (
              <>
                <p>
                  {children.data?.total ?? "…"} matching assets · select an
                  asset node for technical details
                </p>
                {children.error && (
                  <p role="alert">
                    {children.error}
                    <button onClick={children.retry}>Retry</button>
                  </p>
                )}
                <div className="network-pagination">
                  <button
                    disabled={childPage <= 1}
                    onClick={() => setChildPage((p) => p - 1)}
                  >
                    Previous assets
                  </button>
                  <span>{childPage}</span>
                  <button
                    disabled={
                      !children.data || childPage * 100 >= children.data.total
                    }
                    onClick={() => setChildPage((p) => p + 1)}
                  >
                    Next assets
                  </button>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
