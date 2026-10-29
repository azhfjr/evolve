import type { ConnectionEntity } from "./connection-model";
import { displayLabel, labelKey } from "./labels";

// Labels belong only to the map; navigation and API DTOs remain project/task.
export type GraphLabel = Omit<ConnectionEntity, "kind"> & { kind: "label" };
export type GraphNode = {
  id: string;
  entity: ConnectionEntity | GraphLabel;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type GraphEdge = { source: string; target: string };
export type Camera = { x: number; y: number; zoom: number };

// Fixed rows and columns keep the hierarchy deterministic without a simulation.
export function layoutConnectionGraph(
  items: ConnectionEntity[],
  parents: ConnectionEntity[] = [],
  compact = false,
  label = items[0]?.labels[0] || parents[0]?.labels[0] || "",
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const entities = new Map(
    [...parents, ...items].map((entity) => [
      `${entity.kind}:${entity.id}`,
      entity,
    ]),
  );
  const ordered = [...entities.values()].sort((a, b) =>
    `${a.kind}:${a.id}` < `${b.kind}:${b.id}`
      ? -1
      : `${a.kind}:${a.id}` > `${b.kind}:${b.id}`
        ? 1
        : 0,
  );
  const projects = ordered.filter((entity) => entity.kind === "project");
  const columns = compact
    ? 1
    : Math.max(1, Math.ceil(Math.sqrt(projects.length)));
  const clusters = projects.map((project) => {
    const tasks = ordered.filter(
      (entity) => entity.kind === "task" && entity.projectId === project.id,
    );
    const taskColumns = Math.min(compact ? 2 : 4, Math.max(1, tasks.length));
    return {
      project,
      tasks,
      taskColumns,
      width: Math.max(260, taskColumns * 180 + 40),
      height: 150 + Math.ceil(tasks.length / taskColumns) * 126,
    };
  });
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(
      260,
      ...clusters
        .filter((_, index) => index % columns === column)
        .map((cluster) => cluster.width),
    ),
  );
  const rowHeights = Array.from(
    { length: Math.ceil(projects.length / columns) },
    (_, row) =>
      Math.max(
        ...clusters
          .slice(row * columns, (row + 1) * columns)
          .map((cluster) => cluster.height),
      ),
  );
  const nodes: GraphNode[] = [],
    edges: GraphEdge[] = [];
  const canonical = labelKey(label),
    rootId = `label:${canonical}`;
  const worldWidth = columnWidths.reduce((a, b) => a + b, 0);
  if (canonical)
    nodes.push({
      id: rootId,
      entity: {
        id: canonical,
        kind: "label",
        title: displayLabel(canonical),
        projectId: null,
        status: "",
        archived: false,
        version: 1,
        labels: [canonical],
      },
      x: worldWidth / 2,
      y: 40,
      width: 220,
      height: 88,
    });
  for (const [index, cluster] of clusters.entries()) {
    const column = index % columns,
      row = Math.floor(index / columns);
    const x =
      columnWidths.slice(0, column).reduce((a, b) => a + b, 0) +
      columnWidths[column] / 2;
    const y = 230 + rowHeights.slice(0, row).reduce((a, b) => a + b, 0);
    const projectId = `project:${cluster.project.id}`;
    nodes.push({
      id: projectId,
      entity: cluster.project,
      x,
      y,
      width: 176,
      height: 90,
    });
    if (canonical) edges.push({ source: rootId, target: projectId });
    cluster.tasks.forEach((task, taskIndex) => {
      const taskColumn = taskIndex % cluster.taskColumns,
        taskRow = Math.floor(taskIndex / cluster.taskColumns);
      const rowCount = Math.min(
        cluster.taskColumns,
        cluster.tasks.length - taskRow * cluster.taskColumns,
      );
      const id = `task:${task.id}`;
      nodes.push({
        id,
        entity: task,
        x: x + (taskColumn - (rowCount - 1) / 2) * 180,
        y: y + 150 + taskRow * 126,
        width: 148,
        height: 78,
      });
      edges.push({ source: projectId, target: id });
    });
  }
  let offset = worldWidth;
  // Legacy orphan responses stay visible, without inventing a project or edge.
  for (const entity of ordered) {
    const id = `${entity.kind}:${entity.id}`;
    if (!nodes.some((node) => node.id === id)) {
      nodes.push({
        id,
        entity,
        x: offset + 100,
        y: 230,
        width: 148,
        height: 78,
      });
      offset += 210;
    }
  }
  return { nodes, edges };
}
export function fitConnectionGraph(
  nodes: GraphNode[],
  width: number,
  height: number,
): Camera {
  if (!nodes.length || width <= 0 || height <= 0)
    return { x: 0, y: 0, zoom: 1 };
  const left = Math.min(...nodes.map((n) => n.x - n.width / 2));
  const right = Math.max(...nodes.map((n) => n.x + n.width / 2));
  const top = Math.min(...nodes.map((n) => n.y - n.height / 2));
  const bottom = Math.max(...nodes.map((n) => n.y + n.height / 2));
  const zoom = Math.min(
    1,
    Math.max(1, width - 48) / (right - left),
    Math.max(1, height - 48) / (bottom - top),
  );
  return {
    x: width / 2 - ((left + right) * zoom) / 2,
    y: height / 2 - ((top + bottom) * zoom) / 2,
    zoom,
  };
}
export function zoomAt(
  camera: Camera,
  zoom: number,
  point: { x: number; y: number },
): Camera {
  const value = Math.max(0.025, Math.min(2.5, zoom));
  return {
    x: point.x - ((point.x - camera.x) * value) / camera.zoom,
    y: point.y - ((point.y - camera.y) * value) / camera.zoom,
    zoom: value,
  };
}
