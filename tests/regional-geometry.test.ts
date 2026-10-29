import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { projectedBoundaries } from "../src/lib/board-room/region-geometry";
import { REGION_CODES } from "../src/lib/board-room/regions";
test("licensed polygons preserve five real province geometries and produce finite shared-projection paths", async () => {
  const raw = await readFile("public/geodata/kalimantan-provinces.json");
  const data = JSON.parse(raw.toString());
  const metadata = JSON.parse(
    await readFile("public/geodata/provenance.json", "utf8"),
  );
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    metadata.derivedSHA256,
  );
  assert.equal(metadata.revision, "9469f09");
  assert.deepEqual(
    data.features.map(
      (f: { properties: { code: string } }) => f.properties.code,
    ),
    [...REGION_CODES],
  );
  const paths = projectedBoundaries(data);
  assert.equal(paths.length, 5);
  for (const path of paths) {
    assert.ok(path.d.startsWith("M"));
    assert.ok(path.d.includes("Z"));
    assert.ok(!/NaN|Infinity/.test(path.d));
  }
  assert.ok(
    (await readFile("public/geodata/ODbL-1.0.txt", "utf8")).includes(
      "Open Database License",
    ),
  );
});
