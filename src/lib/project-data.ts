import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { database, type Database } from "./db";
import * as s from "./db/schema";
import { readProjectLabels } from "./labels";
import { AppError } from "./permissions";
export async function projectSummaries(
  connection?: Pick<Database, "select">,
  id?: string,
) {
  const db = connection || (await database()).db;
  const projects = await db
    .select({
      ...getTableColumns(s.project),
      spent: sql<string>`coalesce(sum(${s.projectExpense.amount}) FILTER(WHERE NOT ${s.projectExpense.voided} AND ${s.projectExpense.currency}=${s.project.currency}),0)::text`,
      spentByCurrency: sql<
        { currency: import("./project-model").Currency; amount: string }[]
      >`coalesce((SELECT jsonb_agg(totals ORDER BY currency) FROM (SELECT currency,sum(amount)::text AS amount FROM project_expense WHERE project_id=${s.project.id} AND NOT voided GROUP BY currency) totals),'[]'::jsonb)`,
      expenseCount: sql<number>`count(${s.projectExpense.id})::int`,
    })
    .from(s.project)
    .leftJoin(s.projectExpense, eq(s.project.id, s.projectExpense.projectId))
    .where(id ? eq(s.project.id, id) : undefined)
    .groupBy(s.project.id)
    .orderBy(asc(s.project.createdAt));
  return projects.map((project) => ({
    ...project,
    labels: readProjectLabels(project.labels),
  }));
}
export async function projectLedger(projectId: string, cursor?: string) {
  z.uuid().parse(projectId);
  const { db } = await database();
  const [project] = await projectSummaries(db, projectId);
  if (!project) throw new AppError("Project not found.", 404);
  const conditions = [eq(s.projectExpense.projectId, projectId)];
  if (cursor) {
    let data: { projectId: string; id: string; date: string };
    try {
      data = z
        .object({
          projectId: z.literal(projectId),
          id: z.uuid(),
          date: z.iso.date(),
        })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    } catch {
      throw new AppError("Invalid expense cursor.", 400);
    }
    conditions.push(
      sql`(${s.projectExpense.bookedOn},${s.projectExpense.id})<(${data.date},${data.id})`,
    );
  }
  const expenses = await db
    .select()
    .from(s.projectExpense)
    .where(and(...conditions))
    .orderBy(desc(s.projectExpense.bookedOn), desc(s.projectExpense.id))
    .limit(51);
  const categories = await db.execute(
    sql`SELECT category,currency,sum(amount)::text AS amount FROM project_expense WHERE project_id=${projectId} AND NOT voided GROUP BY category,currency ORDER BY currency,category`,
  );
  const page = expenses.slice(0, 50),
    last = page.at(-1);
  return JSON.parse(
    JSON.stringify({
      project,
      expenses: page,
      categories: categories.rows,
      nextCursor:
        expenses.length > 50 && last
          ? Buffer.from(
              JSON.stringify({ projectId, id: last.id, date: last.bookedOn }),
            ).toString("base64url")
          : null,
    }),
  );
}
