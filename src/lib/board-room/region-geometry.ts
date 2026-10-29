type Point = number[];
type Polygon = Point[][];
type Geometry = { type: string; coordinates: number[][][] | number[][][][] };
export type BoundaryCollection = {
  features: { properties: { code: string }; geometry: Geometry }[];
};
function polygons(geometry: Geometry): Polygon[] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates as Polygon]
    : (geometry.coordinates as Polygon[]);
}
/** Equidistant cylindrical projection at the equator; a shared fit preserves relative geography. */
export function projectedBoundaries(
  data: BoundaryCollection,
): { code: string; d: string }[] {
  const points = data.features.flatMap((f) =>
    polygons(f.geometry).flatMap((p) => p.flat()),
  );
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const scale = Math.min(680 / (maxX - minX), 440 / (maxY - minY));
  const offsetX = (720 - (maxX - minX) * scale) / 2,
    offsetY = (480 - (maxY - minY) * scale) / 2;
  return data.features.map((f) => ({
    code: f.properties.code,
    d: polygons(f.geometry)
      .map((p) =>
        p
          .map(
            (r) =>
              r
                .map(
                  ([x, y], i) =>
                    `${i ? "L" : "M"}${(offsetX + (x - minX) * scale).toFixed(2)},${(offsetY + (maxY - y) * scale).toFixed(2)}`,
                )
                .join("") + "Z",
          )
          .join(""),
      )
      .join(""),
  }));
}
