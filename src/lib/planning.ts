import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./db";
import * as s from "./db/schema";
import { readProjectLabels } from "./labels";
import { AppError } from "./permissions";
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function hydrateDependencies<
  T extends { id: string; projectId: string | null },
>(db: Pick<Database, "select">, rows: T[]) {
  if (!rows.length) return [];
  const projectIds = [
    ...new Set(rows.flatMap((row) => (row.projectId ? [row.projectId] : []))),
  ];
  const [links, projects] = await Promise.all([
    db
      .select()
      .from(s.taskDependency)
      .where(
        inArray(
          s.taskDependency.taskId,
          rows.map((row) => row.id),
        ),
      ),
    projectIds.length
      ? db
          .select({ id: s.project.id, labels: s.project.labels })
          .from(s.project)
          .where(inArray(s.project.id, projectIds))
      : Promise.resolve([]),
  ]);
  const projectLabels = new Map(
    projects.map((project) => [project.id, readProjectLabels(project.labels)]),
  );
  const grouped = new Map<string, string[]>();
  for (const link of links) {
    const value = grouped.get(link.taskId) || [];
    value.push(link.dependsOnId);
    grouped.set(link.taskId, value);
  }
  return rows.map((row) => ({
    ...row,
    labels: row.projectId ? projectLabels.get(row.projectId) || [] : [],
    dependencies: grouped.get(row.id) || [],
  }));
}
export async function setDependencies(
  tx: Transaction,
  id: string,
  dependencies: string[],
) {
  if (dependencies.includes(id))
    throw new AppError(
      "Task tidak dapat bergantung pada dirinya sendiri.",
      400,
    );
  if (dependencies.length) {
    const existing = await tx
      .select({ id: s.task.id })
      .from(s.task)
      .where(inArray(s.task.id, dependencies));
    if (existing.length !== dependencies.length)
      throw new AppError("Task dependency tidak ditemukan.", 400);
  }
  await tx.delete(s.taskDependency).where(eq(s.taskDependency.taskId, id));
  if (dependencies.length)
    await tx
      .insert(s.taskDependency)
      .values(dependencies.map((dependsOnId) => ({ taskId: id, dependsOnId })));
}
export async function validateTaskGraph(tx: Transaction, id: string) {
  const cycle = await tx.execute(
    sql`WITH RECURSIVE edges(a,b) AS (SELECT task_id,depends_on_id FROM task_dependency UNION SELECT parent_id,id FROM task WHERE parent_id IS NOT NULL), reach(n) AS (SELECT b FROM edges WHERE a=${id} UNION SELECT e.b FROM edges e JOIN reach r ON e.a=r.n) SELECT EXISTS(SELECT 1 FROM reach WHERE n=${id}) AS cycle`,
  );
  if (cycle.rows[0].cycle)
    throw new AppError(
      "Hubungan ini membuat siklus antara subtask dan dependency.",
      409,
    );
  const [task] = await tx.select().from(s.task).where(eq(s.task.id, id));
  if (task.parentId) {
    const parentCycle = await tx.execute(
      sql`WITH RECURSIVE edges(a,b) AS (SELECT task_id,depends_on_id FROM task_dependency UNION SELECT parent_id,id FROM task WHERE parent_id IS NOT NULL), reach(n) AS (SELECT b FROM edges WHERE a=${task.parentId} UNION SELECT e.b FROM edges e JOIN reach r ON e.a=r.n) SELECT EXISTS(SELECT 1 FROM reach WHERE n=${task.parentId}) AS cycle`,
    );
    if (parentCycle.rows[0].cycle)
      throw new AppError("Hubungan parent dan dependency membuat siklus.", 409);
  }
}
export async function validateCompletion(tx: Transaction, id: string) {
  const blockers = await tx.execute(
    sql`SELECT title FROM task WHERE id IN(SELECT depends_on_id FROM task_dependency WHERE task_id=${id}) AND status<>'done' UNION ALL SELECT title FROM task WHERE parent_id=${id} AND NOT archived AND status<>'done' LIMIT 1`,
  );
  if (blockers.rows.length)
    throw new AppError(
      "Selesaikan subtask dan task penghambat sebelum menandai pekerjaan ini selesai.",
      409,
    );
}
export { nextRecurrenceDate } from "./recurrence";
