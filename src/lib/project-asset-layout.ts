export type MapNode = { id: string; parentId: string | null };
export function boundedProjectNodes<T extends MapNode>(
  nodes: T[],
  focusedRoot?: string,
): T[] {
  const roots = nodes.filter((n) => n.parentId === null).slice(0, 250),
    ids = new Set(roots.map((n) => n.id));
  return [
    ...roots,
    ...nodes
      .filter((n) => n.parentId !== null && ids.has(n.parentId))
      .sort(
        (a, b) =>
          Number(b.parentId === focusedRoot) -
          Number(a.parentId === focusedRoot),
      )
      .slice(0, 250 - roots.length),
  ];
}
export function layoutProjectAssets(
  nodes: MapNode[],
  previous: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const roots = nodes.filter((n) => n.parentId === null);
  for (const [i, root] of roots.entries()) {
    positions[root.id] = previous[root.id] ?? {
      x: 180 + (i % 5) * 380,
      y: 180 + Math.floor(i / 5) * 350,
    };
    const children = nodes.filter((n) => n.parentId === root.id);
    children.forEach((child, index) => {
      const angle = (index / Math.max(children.length, 1)) * Math.PI * 2;
      const radius = 95 + Math.floor(index / 12) * 22;
      positions[child.id] = previous[child.id] ?? {
        x: positions[root.id].x + Math.cos(angle) * radius,
        y: positions[root.id].y + Math.sin(angle) * radius,
      };
    });
  }
  return positions;
}
