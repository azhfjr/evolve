import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutProjectAssets,
  boundedProjectNodes,
} from "../src/lib/project-asset-layout";
test("layout retains positions and bounds rendered nodes", () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    parentId: i > 10 ? "0" : null,
  }));
  const bounded = boundedProjectNodes(nodes);
  assert.equal(bounded.length, 250);
  const positions = layoutProjectAssets(bounded, { "0": { x: 7, y: 9 } });
  assert.deepEqual(positions["0"], { x: 7, y: 9 });
  assert.ok(
    Object.values(positions).every(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  );
  assert.deepEqual(layoutProjectAssets([], {}), {});
  assert.deepEqual(layoutProjectAssets(bounded, positions), positions);
});
test("focused child page is fully reachable despite other project children", () => {
  const roots = Array.from({ length: 25 }, (_, i) => ({
    id: "p" + i,
    parentId: null,
  }));
  const other = Array.from({ length: 200 }, (_, i) => ({
    id: "other" + i,
    parentId: "p1",
  }));
  const focused = Array.from({ length: 100 }, (_, i) => ({
    id: "focus" + i,
    parentId: "p0",
  }));
  const rendered = boundedProjectNodes([...roots, ...other, ...focused], "p0");
  assert.equal(rendered.filter((n) => n.id.startsWith("focus")).length, 100);
  assert.equal(rendered.length, 250);
});
