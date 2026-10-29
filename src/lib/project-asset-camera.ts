export type MapCamera = { x: number; y: number; k: number };
export function zoomMapAt(
  camera: MapCamera,
  point: { x: number; y: number },
  factor: number,
): MapCamera {
  const k = Math.min(4, Math.max(0.1, camera.k * factor));
  return {
    k,
    x: point.x - ((point.x - camera.x) * k) / camera.k,
    y: point.y - ((point.y - camera.y) * k) / camera.k,
  };
}
