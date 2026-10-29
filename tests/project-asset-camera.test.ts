import { test } from "node:test";
import assert from "node:assert/strict";
import { zoomMapAt } from "../src/lib/project-asset-camera";
test("pinch zoom preserves the touched map coordinate and bounds scale", () => {
  const c = { x: 20, y: 40, k: 1 };
  const p = { x: 120, y: 140 };
  const next = zoomMapAt(c, p, 2);
  assert.deepEqual(next, { x: -80, y: -60, k: 2 });
  assert.equal(zoomMapAt(c, p, 100).k, 4);
  assert.equal(zoomMapAt(c, p, 0.001).k, 0.1);
});
