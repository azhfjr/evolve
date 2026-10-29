import { cleanLabel, readProjectLabels } from "./labels";
import type { Project, Task, WorkspaceData } from "./types";

export function projectLabels(projects: Project[], projectId: string | null) {
  const labels =
    projects.find((project) => project.id === projectId)?.labels || [];
  return readProjectLabels(labels);
}

// The demo mirrors the server's effective read model; it contains no organization data.
export function refreshDemoLabels(data: WorkspaceData) {
  const labels = new Map(
    data.projects.map((project) => {
      project.labels = projectLabels([project], project.id);
      return [project.id, project.labels] as const;
    }),
  );
  for (const task of data.tasks)
    task.labels = labels.get(task.projectId || "") || [];
  return data;
}

export function matchesTaskSearch(
  task: Pick<Task, "title" | "description" | "labels">,
  query: string,
) {
  const text = query.trim().toLowerCase();
  const tag = cleanLabel(query);
  return (
    `${task.title} ${task.description}`.toLowerCase().includes(text) ||
    Boolean(tag && task.labels.some((label) => cleanLabel(label).includes(tag)))
  );
}
