export function preserveBoardContext(
  next: URLSearchParams,
  current: URLSearchParams,
): URLSearchParams {
  for (const key of [
    "storyProject",
    "costProject",
    "projectTab",
    "project",
    "assetQuery",
    "assetProject",
    "assetPage",
    "asset",
    "mapFilters",
    "mapPage",
    "mapProject",
    "mapAssetPage",
    "mapView",
    "qualityPage",
    "networkFilters",
    "networkPage",
    "assetUnit",
    "assetCategory",
    "projectScope",
  ]) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  return next;
}
