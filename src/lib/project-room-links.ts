import { connectedEnabled } from "./connected/transition";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import * as s from "./db/schema";
import { assertActorActive } from "./membership";
import { AppError } from "./permissions";
import type { Actor } from "./types";
export const roomLinkQuery = z.object({
  room: z.enum(["locker", "board"]),
  id: z.uuid(),
});
export type RelatedProjects = {
  code: string;
  targetRoom: "locker" | "board";
  projects: { id: string; name: string; href: string }[];
  hasMore: boolean;
};
// A link is a lookup only. A matching code never grants writes to either record.
export async function relatedRoomProjects(
  actor: Actor,
  input: unknown,
): Promise<RelatedProjects> {
  const query = roomLinkQuery.parse(input);
  const { db } = await database();
  return db.transaction(
    async (tx) => {
      await assertActorActive(tx, actor);
      const source =
        query.room === "board"
          ? (
              await tx
                .select({ code: s.boardRoomProject.externalId })
                .from(s.boardRoomProject)
                .where(eq(s.boardRoomProject.id, query.id))
            )[0]
          : (
              await tx
                .select({ code: s.project.reference })
                .from(s.project)
                .where(eq(s.project.id, query.id))
            )[0];
      if (!source) throw new AppError("Project not found.", 404);
      const code = source.code.trim().toUpperCase();
      const targetRoom = query.room === "board" ? "locker" : "board";
      if (await connectedEnabled(tx)) {
        const matches =
          query.room === "board"
            ? await tx
                .select({ id: s.project.id, name: s.project.name })
                .from(s.project)
                .where(eq(s.project.id, query.id))
            : await tx
                .select({
                  id: s.boardRoomProject.id,
                  name: sql<string>`${s.boardRoomProject.data}->>'name'`,
                })
                .from(s.boardRoomProject)
                .where(eq(s.boardRoomProject.id, query.id));
        return {
          code,
          targetRoom,
          hasMore: false,
          projects: matches.map((p) => ({
            ...p,
            href:
              targetRoom === "locker"
                ? `/app?section=project&project=${p.id}`
                : `/board-room/projects/${p.id}`,
          })),
        };
      }
      if (!code) return { code, targetRoom, projects: [], hasMore: false };
      const matches =
        query.room === "board"
          ? await tx
              .select({ id: s.project.id, name: s.project.name })
              .from(s.project)
              .where(sql`upper(trim(${s.project.reference}))=${code}`)
              .orderBy(s.project.name, s.project.id)
              .limit(21)
          : await tx
              .select({
                id: s.boardRoomProject.id,
                name: sql<string>`${s.boardRoomProject.data}->>'name'`,
              })
              .from(s.boardRoomProject)
              .where(sql`upper(trim(${s.boardRoomProject.externalId}))=${code}`)
              .orderBy(s.boardRoomProject.externalId, s.boardRoomProject.id)
              .limit(21);
      return {
        code,
        targetRoom,
        hasMore: matches.length > 20,
        projects: matches.slice(0, 20).map((p) => ({
          ...p,
          href:
            targetRoom === "locker"
              ? `/app?section=project&project=${encodeURIComponent(p.id)}`
              : `/board-room/projects/${encodeURIComponent(p.id)}`,
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
