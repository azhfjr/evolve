"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Minus,
  Plus,
  Tag,
  Pencil,
  Maximize,
  Minimize,
  Scan,
} from "lucide-react";
import type { ConnectionEntity } from "@/lib/connection-model";
import { displayLabel } from "@/lib/labels";
import {
  layoutConnectionGraph,
  fitConnectionGraph,
  zoomAt,
  type Camera,
} from "@/lib/connection-graph";
const noParents: ConnectionEntity[] = [];
type Point = { x: number; y: number };
export function ConnectionTree({
  label,
  items,
  parents = noParents,
  total,
  onOpen,
  busy,
  onEdit,
  canEdit,
  entityNoun = "Task",
  projectRooted = false,
}: {
  entityNoun?: "Task" | "Asset";
  projectRooted?: boolean;
  label: string;
  items: ConnectionEntity[];
  parents?: ConnectionEntity[];
  total: number;
  onOpen: (entity: ConnectionEntity) => void;
  busy?: boolean;
  onEdit: (entity: ConnectionEntity) => void;
  canEdit: (entity: ConnectionEntity) => boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    enterButton = useRef<HTMLButtonElement>(null);
  const [viewElement, setViewElement] = useState<HTMLDivElement | null>(null);
  const bindViewport = useCallback((node: HTMLDivElement | null) => {
    viewport.current = node;
    setViewElement(node);
  }, []);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 599px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const graph = useMemo(() => {
    const result = layoutConnectionGraph(items, parents, compact, label);
    if (entityNoun !== "Asset" && !projectRooted) return result;
    const nodes = result.nodes.filter((n) => n.entity.kind !== "label"),
      ids = new Set(nodes.map((n) => n.id));
    return {
      nodes,
      edges: result.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }, [items, parents, compact, label, entityNoun, projectRooted]);
  const signature = graph.nodes
    .map((n) => `${n.id}:${n.entity.projectId || ""}:${n.x}:${n.y}`)
    .join("|");
  const currentGraph = useRef(graph);
  useLayoutEffect(() => {
    currentGraph.current = graph;
  }, [graph]);
  const [immersive, setImmersive] = useState(false),
    [highlight, setHighlight] = useState(""),
    [contextId, setContextId] = useState("");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera),
    size = useRef({ width: 0, height: 0 });
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const positionsRef = useRef<Record<string, Point>>({});
  const frame = useRef(0);
  const publish = useCallback(() => {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setCamera({ ...cameraRef.current });
        setPositions({ ...positionsRef.current });
      });
  }, []);
  const fit = useCallback(() => {
    positionsRef.current = {};
    cameraRef.current = fitConnectionGraph(
      currentGraph.current.nodes,
      size.current.width,
      size.current.height,
    );
    publish();
  }, [publish]);
  // The camera is owned above the portal so native fullscreen never loses the view.

  const fullscreen = useRef({ open: false, requested: false, active: false });
  const afterClose = useRef<(() => void) | null>(null);
  const exitImmersive = useCallback(async () => {
    fullscreen.current.open = false;
    // Keep the modal mounted until native fullscreen has finished exiting.
    // Opening a project or label editor then cannot leave its portal behind it.
    if (
      fullscreen.current.requested &&
      document.fullscreenElement === document.documentElement
    ) {
      try {
        await document.exitFullscreen();
      } catch {
        // The browser may already be processing an Escape/fullscreenchange exit.
      }
    }
    fullscreen.current.active = false;
    setImmersive(false);
  }, []);

  useEffect(() => {
    const state = fullscreen.current;
    const onFullscreenChange = () => {
      if (
        state.requested &&
        document.fullscreenElement === document.documentElement
      ) {
        state.active = true;
        if (!state.open) void document.exitFullscreen().catch(() => {});
      } else if (state.active) {
        state.active = false;
        if (state.open) {
          state.open = false;
          setImmersive(false);
        }
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      state.open = false;
      cancelAnimationFrame(frame.current);
      if (
        state.requested &&
        document.fullscreenElement === document.documentElement
      )
        void document.exitFullscreen().catch(() => {});
    };
  }, []);

  function enterImmersive() {
    fullscreen.current.open = true;
    fullscreen.current.requested = false;
    setImmersive(true);
    // Request in the click's activation window. The viewport dialog is also
    // available when the API is absent or the browser rejects the request.
    if (
      !document.fullscreenElement &&
      document.documentElement.requestFullscreen
    ) {
      fullscreen.current.requested = true;
      try {
        void document.documentElement
          .requestFullscreen()
          .then(() => {
            fullscreen.current.active =
              document.fullscreenElement === document.documentElement;
            if (!fullscreen.current.open && fullscreen.current.active)
              void document.exitFullscreen().catch(() => {});
          })
          .catch(() => {});
      } catch {
        // Some browsers throw synchronously rather than returning a rejection.
      }
    }
  }

  function openEntity(item: ConnectionEntity, edit = false) {
    const action = () => (edit ? onEdit(item) : onOpen(item));
    if (!fullscreen.current.open) {
      action();
      return;
    }
    afterClose.current = action;
    void exitImmersive();
  }

  useLayoutEffect(() => {
    if (!viewElement) return;
    let initialized = false;
    const measure = () => {
      const width = viewElement.clientWidth,
        height = viewElement.clientHeight;
      if (!width || !height) return;
      const previous = size.current;
      size.current = { width, height };
      if (!previous.width) fit();
      else {
        cameraRef.current = {
          ...cameraRef.current,
          x: cameraRef.current.x + (width - previous.width) / 2,
          y: cameraRef.current.y + (height - previous.height) / 2,
        };
        publish();
      }
      initialized = true;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewElement);
    if (!initialized) measure();
    return () => observer.disconnect();
  }, [viewElement, fit, publish]);
  useLayoutEffect(() => {
    fit();
  }, [signature, fit]);
  const changeZoom = useCallback(
    (next: number, point?: Point) => {
      cameraRef.current = zoomAt(
        cameraRef.current,
        next,
        point || { x: size.current.width / 2, y: size.current.height / 2 },
      );
      publish();
    },
    [publish],
  );
  useEffect(() => {
    if (!viewElement) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = viewElement.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? size.current.height
            : 1);
      changeZoom(
        cameraRef.current.zoom *
          Math.exp(-Math.max(-150, Math.min(150, delta)) * 0.003),
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      );
    };
    viewElement.addEventListener("wheel", wheel, { passive: false });
    return () => viewElement.removeEventListener("wheel", wheel);
  }, [viewElement, changeZoom]);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    id: string | null;
    point: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(".connection-node-edit")
    )
      return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      ".connection-node",
    );
    const key =
      target?.closest<HTMLElement>("[data-anchor]")?.dataset.anchor || null;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1) {
      gesture.current = {
        id: key,
        point: { x: event.clientX, y: event.clientY },
        moved: false,
      };
      suppressClick.current = false;
    } else if (gesture.current) {
      gesture.current.id = null;
      gesture.current.moved = true;
    }
    (
      target?.closest<HTMLElement>(".connection-node-shell") ||
      event.currentTarget
    ).setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const old = pointers.current.get(event.pointerId),
      active = gesture.current;
    if (!old || !active) return;
    const before = [...pointers.current.values()];
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (Math.hypot(next.x - active.point.x, next.y - active.point.y) > 4)
      active.moved = true;
    if (!active.moved) return;
    event.currentTarget.dataset.dragging = "true";
    if (pointers.current.size >= 2) {
      const after = [...pointers.current.values()];
      const a = {
        x: (before[0].x + before[1].x) / 2,
        y: (before[0].y + before[1].y) / 2,
      };
      const b = {
        x: (after[0].x + after[1].x) / 2,
        y: (after[0].y + after[1].y) / 2,
      };
      const distance = Math.hypot(
        before[0].x - before[1].x,
        before[0].y - before[1].y,
      );
      const nextDistance = Math.hypot(
        after[0].x - after[1].x,
        after[0].y - after[1].y,
      );
      const bounds = event.currentTarget.getBoundingClientRect();
      const camera = zoomAt(
        cameraRef.current,
        (cameraRef.current.zoom * nextDistance) / Math.max(1, distance),
        { x: a.x - bounds.left, y: a.y - bounds.top },
      );
      cameraRef.current = {
        ...camera,
        x: camera.x + b.x - a.x,
        y: camera.y + b.y - a.y,
      };
    } else if (active.id) {
      const node = currentGraph.current.nodes.find((n) => n.id === active.id);
      if (node) {
        const position = positionsRef.current[active.id] || node;
        positionsRef.current = {
          ...positionsRef.current,
          [active.id]: {
            x: position.x + (next.x - old.x) / cameraRef.current.zoom,
            y: position.y + (next.y - old.y) / cameraRef.current.zoom,
          },
        };
      }
    } else
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + next.x - old.x,
        y: cameraRef.current.y + next.y - old.y,
      };
    publish();
  }
  function endPointer(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) {
      suppressClick.current = Boolean(gesture.current?.moved);
      gesture.current = null;
      delete event.currentTarget.dataset.dragging;
    } else if (gesture.current) {
      gesture.current.id = null;
      gesture.current.point = [...pointers.current.values()][0];
    }
  }
  function focusNode(id: string) {
    setHighlight(id);
    const n = currentGraph.current.nodes.find((n) => n.id === id);
    if (!n) return;
    if (n.entity.kind !== "label") setContextId(id);
    const p = positionsRef.current[id] || n,
      c = cameraRef.current;
    const x = p.x * c.zoom + c.x,
      y = p.y * c.zoom + c.y;
    if (
      x < (n.width * c.zoom) / 2 ||
      y < (n.height * c.zoom) / 2 ||
      x > size.current.width - (n.width * c.zoom) / 2 ||
      y > size.current.height - (n.height * c.zoom) / 2
    ) {
      cameraRef.current = {
        ...c,
        x: size.current.width / 2 - p.x * c.zoom,
        y: size.current.height / 2 - p.y * c.zoom,
      };
      publish();
    }
  }
  const nodes = graph.nodes.map((n) => ({ ...n, ...positions[n.id] }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Set([highlight]);
  for (const edge of graph.edges)
    if (edge.source === highlight || edge.target === highlight) {
      neighbors.add(edge.source);
      neighbors.add(edge.target);
    }
  const selected = nodeMap.get(highlight || contextId);
  const contextNode =
    selected?.entity.kind === "label" ? nodeMap.get(contextId) : selected;
  const contextProject =
    (contextNode?.entity.kind === "project"
      ? contextNode
      : nodeMap.get(`project:${contextNode?.entity.projectId}`)) ||
    nodes.find((n) => n.entity.kind === "project");
  const contextEntity =
    contextProject?.entity.kind === "project"
      ? contextProject.entity
      : undefined;
  const overview = camera.zoom < 0.36;
  const Node = overview ? "div" : "button";
  const map = (
    <div className="connection-map" data-immersive={immersive}>
      <div className="connection-map-tools">
        <span>
          <Tag size={14} />
          {displayLabel(label)}{" "}
          <span className="connection-hierarchy-label">
            ·{" "}
            {entityNoun === "Asset"
              ? "Project → Asset"
              : projectRooted
                ? "Project → Task"
                : "Label → Project → Task"}
          </span>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={camera.zoom <= 0.025}
            onClick={() => changeZoom(cameraRef.current.zoom / 1.2)}
          >
            <Minus size={15} />
          </button>
          <output aria-label="Map zoom">
            {Math.round(camera.zoom * 100)}%
          </output>
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={camera.zoom >= 2.5}
            onClick={() => changeZoom(cameraRef.current.zoom * 1.2)}
          >
            <Plus size={15} />
          </button>
          <button
            className="connection-fit-button"
            onClick={fit}
            title="Reset positions and fit displayed items (0)"
          >
            <Scan size={15} />
            Fit map
          </button>
          <button
            ref={immersive ? undefined : enterButton}
            className="icon-button connection-fullscreen-button"
            aria-label={immersive ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={immersive ? () => void exitImmersive() : enterImmersive}
          >
            {immersive ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        </div>
      </div>
      <div
        ref={bindViewport}
        className="connection-viewport"
        role="region"
        aria-label="Connection map. Drag to pan, scroll to zoom, or use arrow keys."
        tabIndex={0}
        data-camera-x={camera.x}
        data-camera-y={camera.y}
        data-camera-zoom={camera.zoom}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const move: Record<string, [number, number]> = {
            ArrowLeft: [80, 0],
            ArrowRight: [-80, 0],
            ArrowUp: [0, 80],
            ArrowDown: [0, -80],
            PageUp: [0, size.current.height * 0.8],
            PageDown: [0, -size.current.height * 0.8],
            End: [0, -size.current.height * 0.8],
          };
          if (["+", "=", "-"].includes(event.key)) {
            event.preventDefault();
            changeZoom(
              cameraRef.current.zoom * (event.key === "-" ? 1 / 1.2 : 1.2),
            );
          } else if (["0", "Home"].includes(event.key)) {
            event.preventDefault();
            fit();
          } else if (move[event.key]) {
            event.preventDefault();
            cameraRef.current = {
              ...cameraRef.current,
              x: cameraRef.current.x + move[event.key][0],
              y: cameraRef.current.y + move[event.key][1],
            };
            publish();
          }
        }}
      >
        <div
          className="connection-tree-scene"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <svg className="connection-lines" aria-hidden="true">
            {graph.edges.map((edge) => {
              const a = nodeMap.get(edge.source)!,
                b = nodeMap.get(edge.target)!;
              const active =
                neighbors.has(edge.source) && neighbors.has(edge.target);
              return (
                <path
                  key={edge.target}
                  data-source={edge.source}
                  data-target={edge.target}
                  data-highlighted={active}
                  className={active ? "is-highlighted" : ""}
                  d={`M${a.x},${a.y + a.height / 2 - 8} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y - b.height / 2 + 8}`}
                />
              );
            })}
          </svg>
          {nodes.map((n) => (
            <div
              key={n.id}
              className="connection-node-shell"
              data-anchor={n.id}
              data-kind={n.entity.kind}
              data-highlighted={neighbors.has(n.id)}
              data-dimmed={Boolean(highlight) && !neighbors.has(n.id)}
              style={{ left: n.x, top: n.y, width: n.width, height: n.height }}
              onClick={(event) => {
                if (busy) return;
                if (suppressClick.current && event.detail !== 0) {
                  suppressClick.current = false;
                  return;
                }
                if (overview) {
                  const position = positionsRef.current[n.id] || n;
                  cameraRef.current = {
                    x: size.current.width / 2 - position.x * 0.8,
                    y: size.current.height / 2 - position.y * 0.8,
                    zoom: 0.8,
                  };
                  if (n.entity.kind !== "label") setContextId(n.id);
                  setHighlight(n.id);
                  publish();
                } else if (n.entity.kind === "label") fit();
                else openEntity(n.entity);
              }}
            >
              <Node
                type={overview ? undefined : "button"}
                className="connection-node"
                disabled={overview ? undefined : busy}
                aria-hidden={overview || undefined}
                aria-label={
                  overview
                    ? undefined
                    : n.entity.kind === "label"
                      ? `Fit map for ${n.entity.title}`
                      : `Open ${n.entity.kind}: ${n.entity.title}`
                }
                title={`${n.entity.title} · ${n.entity.kind === "label" ? "Fit map" : n.entity.archived ? "Archived" : n.entity.status.replaceAll("_", " ")}`}
                onPointerEnter={() => {
                  setHighlight(n.id);
                  if (n.entity.kind !== "label") setContextId(n.id);
                }}
                onPointerLeave={() => {
                  if (!viewport.current?.querySelector(":focus"))
                    setHighlight("");
                }}
                onFocus={() => focusNode(n.id)}
                onBlur={() => setHighlight("")}
              >
                <span className="connection-node-dot" />
                <strong>{n.entity.title}</strong>
                <small>
                  {n.entity.kind === "label"
                    ? "Connection label · Fit map"
                    : `${n.entity.kind === "project" ? "Project" : entityNoun} · ${n.entity.archived ? "Archived" : n.entity.status.replaceAll("_", " ")}`}
                </small>
              </Node>
            </div>
          ))}
        </div>
      </div>
      <div className="connection-map-hint">
        {contextEntity && canEdit(contextEntity) && (
          <button
            type="button"
            className="connection-label-action"
            disabled={busy}
            aria-label={`Edit labels for ${contextEntity.title}`}
            onClick={() => openEntity(contextEntity, true)}
          >
            <Pencil size={14} />
            Edit project labels
          </button>
        )}
        <p className="connection-map-selection">
          {selected
            ? `${selected.entity.title} · ${selected.entity.kind === "label" ? "Connection label" : selected.entity.kind === "project" ? "Project" : entityNoun}`
            : `${items.length} of ${total} results · ${entityNoun === "Asset" ? "Project → Asset" : projectRooted ? "Project → Task" : "Label → Project → Task"}`}
        </p>
        <span>
          {overview
            ? "Overview · Select a node or zoom in to open items"
            : "Drag nodes or background · Scroll / pinch to zoom · Fit map to reset"}
        </span>
      </div>
    </div>
  );
  return (
    <Dialog.Root
      open={immersive}
      onOpenChange={(open) => !open && void exitImmersive()}
    >
      {!immersive && map}
      <Dialog.Portal
        container={typeof document === "undefined" ? undefined : document.body}
      >
        <Dialog.Overlay className="connection-immersive-overlay" />
        <Dialog.Content
          className="connection-immersive"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            viewport.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const action = afterClose.current;
            afterClose.current = null;
            requestAnimationFrame(() => {
              enterButton.current?.focus({ preventScroll: true });
              action?.();
            });
          }}
        >
          <Dialog.Title className="sr-only">Connection fullscreen</Dialog.Title>
          {immersive && map}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
