import { eq, sql } from "drizzle-orm";
import { database } from "../db";
import * as s from "../db/schema";
import { readWorkspaceExperience } from "../workspace-experience";
import { AppError } from "../permissions";
import type { Actor } from "../types";
import {
  normalizeProjectPayload,
  querySchema,
  type ProjectPayload,
} from "./model";
import { boardProjectWhere } from "./service";
import type { PortfolioReportData } from "./report-format";
export async function boardPortfolioReport(
  actor: Actor,
  input: unknown,
): Promise<PortfolioReportData> {
  const query = querySchema.parse(input);
  const { db } = await database();
  return db.transaction(
    async (tx) => {
      const experience = await readWorkspaceExperience(tx, actor);
      const [config] = await tx
        .select()
        .from(s.boardRoomConfig)
        .where(eq(s.boardRoomConfig.id, "primary"));
      if (!config)
        throw new AppError("Board Room migration has not been applied.", 503);
      const result = await tx.execute(sql`SELECT p.data,
      (p.reviewed_revision IS NOT NULL AND p.reviewed_revision=p.document_revision) AS valid,
      (SELECT count(*)::int FROM attachment a WHERE a.entity_type='boardRoomProject' AND a.entity_id=p.id AND a.state='ready' AND a.is_current) AS file_count
      FROM board_room_project p WHERE ${boardProjectWhere(query)}
      ORDER BY ${query.sort === "name" ? sql`lower(p.data->>'name')` : query.sort === "capacity" ? sql`(p.data->>'capacity')::numeric` : sql`(p.data->>'codYear')::int`}
      ${query.direction === "desc" ? sql`DESC` : sql`ASC`} NULLS LAST,p.external_id LIMIT 5001`);
      if (result.rows.length > 5000)
        throw new AppError("Filter to at most 5,000 projects per report.");
      return {
        generatedAt: new Date().toISOString(),
        generatedBy: experience.actor.name,
        timeZone: experience.profile.timeZone,
        query,
        stages: config.stages,
        rows: result.rows.map((row) => {
          const p = normalizeProjectPayload(row.data as ProjectPayload);
          return {
            externalId: p.externalId,
            name: p.name,
            category: p.category,
            scope: p.scope,
            voltage: p.voltage,
            capacity: p.capacity,
            unit: p.unit,
            codYear: p.codYear,
            startYear: p.startYear,
            stage: p.stage,
            completed: p.completed,
            valid: Boolean(row.valid),
            fileCount: Number(row.file_count),
            responsible: p.responsible ?? "",
            progressReviewedAt: p.progressReviewedAt ?? null,
            progressReviewedBy: p.progressReviewedBy ?? null,
            progressReviewNote: p.progressReviewNote ?? "",
            documentReviewNote: p.documentReviewNote ?? "",
          };
        }),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
