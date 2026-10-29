import assert from "node:assert/strict";
import { test } from "node:test";
import {
  layoutConnectionGraph,
  fitConnectionGraph,
  zoomAt,
} from "../src/lib/connection-graph";
import type { ConnectionEntity } from "../src/lib/connection-model";
const entity = (
  id: string,
  kind: "task" | "project",
  projectId: string | null = null,
): ConnectionEntity => ({
  id,
  kind,
  projectId,
  title: id,
  status: "active",
  archived: false,
  version: 1,
  labels: ["design"],
});
test("graph joins each task only to its own project, including contextual parents", () => {
  const graph = layoutConnectionGraph(
    [
      entity("a", "project"),
      entity("t1", "task", "a"),
      entity("t2", "task", "b"),
    ],
    [entity("b", "project")],
  );
  assert.equal(graph.nodes.length, 5);
  assert.deepEqual(graph.edges.map((e) => [e.source, e.target]).sort(), [
    ["label:design", "project:a"],
    ["label:design", "project:b"],
    ["project:a", "task:t1"],
    ["project:b", "task:t2"],
  ]);
  assert.equal(new Set(graph.nodes.map((n) => n.id)).size, 5);
  assert.deepEqual(
    graph,
    layoutConnectionGraph(
      [
        entity("a", "project"),
        entity("t1", "task", "a"),
        entity("t2", "task", "b"),
      ],
      [entity("b", "project")],
    ),
  );
});
test("fit includes all node labels with padding on narrow and wide viewports", () => {
  const graph = layoutConnectionGraph([
    entity("p", "project"),
    ...Array.from({ length: 24 }, (_, i) => entity(String(i), "task", "p")),
  ]);
  assert.equal(graph.nodes.length, 26);
  for (const [width, height] of [
    [320, 420],
    [1400, 800],
  ]) {
    const camera = fitConnectionGraph(graph.nodes, width, height);
    assert.ok(camera.zoom > 0 && Number.isFinite(camera.zoom));
    for (const n of graph.nodes) {
      assert.ok((n.x - n.width / 2) * camera.zoom + camera.x >= 23);
      assert.ok((n.y - n.height / 2) * camera.zoom + camera.y >= 23);
      assert.ok((n.x + n.width / 2) * camera.zoom + camera.x <= width - 23);
      assert.ok((n.y + n.height / 2) * camera.zoom + camera.y <= height - 23);
    }
  }
  assert.deepEqual(fitConnectionGraph([], 0, 0), { x: 0, y: 0, zoom: 1 });
});
test("zoom preserves the world point under the pointer and clamps finite scale", () => {
  const camera = { x: -100, y: 30, zoom: 0.8 },
    point = { x: 210, y: 190 };
  const next = zoomAt(camera, 1.6, point);
  assert.equal(next.zoom, 1.6);
  assert.equal(
    (point.x - next.x) / next.zoom,
    (point.x - camera.x) / camera.zoom,
  );
  assert.equal(
    (point.y - next.y) / next.zoom,
    (point.y - camera.y) / camera.zoom,
  );
  assert.ok(zoomAt(camera, 100, point).zoom <= 2.5);
  assert.ok(zoomAt(camera, 0, point).zoom > 0);
});

test("many project clusters occupy a balanced area instead of a single long strip", () => {
  const { nodes } = layoutConnectionGraph(
    Array.from({ length: 9 }, (_, i) => entity(String(i), "project")),
  );
  const width =
    Math.max(...nodes.map((n) => n.x + n.width / 2)) -
    Math.min(...nodes.map((n) => n.x - n.width / 2));
  const height =
    Math.max(...nodes.map((n) => n.y + n.height / 2)) -
    Math.min(...nodes.map((n) => n.y - n.height / 2));
  assert.ok(width / height < 2);
});

test("layout stays stable when contextual metadata arrives in a different order", () => {
  const items = [
    entity("t1", "task", "a"),
    entity("t2", "task", "b"),
    entity("t3", "task", "a"),
  ];
  const parents = [entity("a", "project"), entity("b", "project")];
  const positions = (graph: ReturnType<typeof layoutConnectionGraph>) =>
    graph.nodes.map((n) => [n.id, n.x, n.y]);
  assert.deepEqual(
    positions(layoutConnectionGraph(items, parents)),
    positions(
      layoutConnectionGraph([...items].reverse(), [...parents].reverse()),
    ),
  );
});

test("compact graph stacks project clusters so touch targets remain separated", () => {
  const items = [
    entity("a", "project"),
    entity("b", "project"),
    ...Array.from({ length: 12 }, (_, i) =>
      entity(String(i), "task", i < 7 ? "a" : "b"),
    ),
  ];
  const graph = layoutConnectionGraph(items, [], true);
  const [a, b] = graph.nodes.filter((n) => n.entity.kind === "project");
  assert.equal(a.x, b.x);
  assert.ok(b.y > a.y);
  const c = fitConnectionGraph(graph.nodes, 264, 380);
  const rects = graph.nodes.map((n) => ({
    x: (n.x - n.width / 2) * c.zoom,
    y: (n.y - n.height / 2) * c.zoom,
    w: Math.max(28, n.width * c.zoom),
    h: Math.max(28, n.height * c.zoom),
  }));
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i],
        b = rects[j];
      assert.ok(
        a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y,
      );
    }
});

test("selected label is one canonical graph-only root across contextual projects", () => {
  const graph = layoutConnectionGraph(
    [entity("t", "task", "p")],
    [entity("p", "project"), entity("p", "project")],
    false,
    " #DESIGN ",
  );
  const roots = graph.nodes.filter((node) => node.entity.kind === "label");
  assert.equal(roots.length, 1);
  assert.equal(roots[0].id, "label:design");
  assert.equal(roots[0].entity.title, "#design");
  assert.deepEqual(graph.edges, [
    { source: "label:design", target: "project:p" },
    { source: "project:p", target: "task:t" },
  ]);
  assert.ok(
    roots[0].y < graph.nodes.find((node) => node.id === "project:p")!.y,
  );
});
test("root never invents a label-to-task edge for orphan responses", () => {
  const graph = layoutConnectionGraph(
    [entity("orphan", "task", "missing")],
    [],
    false,
    "design",
  );
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges, []);
});
