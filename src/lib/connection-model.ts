import { z } from "zod";
import { labelKey } from "./labels";
import type { WorkspaceData } from "./types";
import { projectLabels } from "./project-labels";

export const connectionQuerySchema = z.object({
  mode: z.enum(["catalog", "items"]).default("catalog"),
  label: z.string().max(120).default("").transform(labelKey),
  q: z.string().trim().max(200).default(""),
  type: z.enum(["all", "project", "task"]).default("all"),
  includeArchived: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(2000).optional(),
});
export type ConnectionQuery = z.infer<typeof connectionQuerySchema>;
export const connectionEntitySchema = z.object({
  id: z.string(),
  kind: z.enum(["project", "task"]),
  projectId: z.string().nullable().default(null),
  title: z.string(),
  status: z.string(),
  archived: z.boolean().default(false),
  version: z.number().int().positive().default(1),
  labels: z.array(z.string()),
});
export type ConnectionEntity = z.infer<typeof connectionEntitySchema>;
export const connectionGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  projectCount: z.number(),
  taskCount: z.number(),
});
export const connectionCatalogSchema = z.object({
  groups: z.array(connectionGroupSchema),
  total: z.number(),
  nextCursor: z.string().nullable(),
});
export const connectionItemsSchema = z.object({
  items: z.array(connectionEntitySchema),
  parents: z.array(connectionEntitySchema).default([]),
  total: z.number(),
  nextCursor: z.string().nullable(),
});
export type ConnectionCatalog = z.infer<typeof connectionCatalogSchema>;
export type ConnectionItems = z.infer<typeof connectionItemsSchema>;
export function connectionFingerprint(query: ConnectionQuery) {
  return JSON.stringify([
    query.mode,
    query.label,
    query.q,
    query.type,
    query.limit,
    query.includeArchived,
  ]);
}
export function readConnectionCursor(query: ConnectionQuery) {
  if (!query.cursor) return "";
  const cursor = z
    .object({
      fingerprint: z.literal(connectionFingerprint(query)),
      after: z.string().max(200),
    })
    .parse(JSON.parse(query.cursor));
  return cursor.after;
}
export function connectionCursor(query: ConnectionQuery, after: string) {
  return JSON.stringify({ fingerprint: connectionFingerprint(query), after });
}
export function demoConnections(
  data: WorkspaceData,
  query: ConnectionQuery,
): ConnectionCatalog | ConnectionItems {
  const after = readConnectionCursor(query);
  const entities: ConnectionEntity[] = [
    ...data.projects.map((p) => ({
      id: p.id,
      kind: "project" as const,
      projectId: null,
      archived: false,
      title: p.name,
      status: p.status || "active",
      labels: projectLabels([p], p.id),
      version: p.version || 1,
    })),
    ...data.tasks
      .filter((t) => query.includeArchived === "true" || !t.archived)
      .map((t) => ({
        id: t.id,
        kind: "task" as const,
        projectId: t.projectId,
        title: t.title,
        status: t.status,
        labels: projectLabels(data.projects, t.projectId),
        archived: t.archived,
        version: t.version || 1,
      })),
  ];
  if (query.mode === "items") {
    const all = entities.filter(
      (e) =>
        e.labels.some((l) => labelKey(l) === query.label) &&
        (query.type === "all" || query.type === e.kind) &&
        e.title.toLowerCase().includes(query.q.toLowerCase()),
    );
    const sorted = all
      .sort((a, b) => (`${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? -1 : 1))
      .filter((e) => `${e.kind}:${e.id}` > after);
    const items = sorted.slice(0, query.limit),
      last = items.at(-1);
    const parentIds = new Set(
      items
        .filter((item) => item.kind === "task")
        .map((item) => item.projectId),
    );
    for (const item of items)
      if (item.kind === "project") parentIds.delete(item.id);
    return {
      items,
      parents: entities.filter(
        (entity) => entity.kind === "project" && parentIds.has(entity.id),
      ),
      total: all.length,
      nextCursor:
        sorted.length > query.limit && last
          ? connectionCursor(query, `${last.kind}:${last.id}`)
          : null,
    };
  }
  const groups = new Map<string, z.infer<typeof connectionGroupSchema>>();
  for (const entity of entities)
    for (const key of new Set(entity.labels.map(labelKey))) {
      if (!key || !key.includes(labelKey(query.q))) continue;
      const group = groups.get(key) || {
        key,
        label: entity.labels.find((l) => labelKey(l) === key)!,
        projectCount: 0,
        taskCount: 0,
      };
      if (entity.kind === "project") group.projectCount++;
      else group.taskCount++;
      groups.set(key, group);
    }
  const sorted = [...groups.values()]
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .filter((g) => g.key > after),
    page = sorted.slice(0, query.limit),
    last = page.at(-1);
  return {
    groups: page,
    total: groups.size,
    nextCursor:
      sorted.length > query.limit && last
        ? connectionCursor(query, last.key)
        : null,
  };
}
