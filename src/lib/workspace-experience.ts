import { eq, sql } from "drizzle-orm";
import { database, type Database } from "./db";
import * as s from "./db/schema";
import { assertActorActive } from "./membership";
import { AppError } from "./permissions";
import {
  defaultProfile,
  preferenceSchema,
  workspaceFields,
  type AccountProfile,
  type WorkspaceSettings,
} from "./preferences";
import type { Actor } from "./types";
import { focusDate, type WorkspaceFocus } from "./workspace-focus";
export type WorkspaceExperience = {
  revision?: number;
  actor: Actor;
  profile: AccountProfile;
  settings: WorkspaceSettings;
};
export type WorkspaceHomeData = WorkspaceExperience & {
  totals: { tasks: number; lockerProjects: number; boardProjects: number };
  focus?: WorkspaceFocus;
};
export async function readWorkspaceExperience(
  db: Pick<Database, "select">,
  actor: Actor,
): Promise<WorkspaceExperience> {
  await assertActorActive(db, actor);
  const [own] = await db
    .select()
    .from(s.member)
    .where(eq(s.member.email, actor.email));
  const [workspace] = await db
    .select()
    .from(s.workspaceSetting)
    .where(eq(s.workspaceSetting.id, "primary"));
  if (!workspace)
    throw new AppError("Workspace configuration is unavailable.", 503);
  const profile = own
    ? {
        name: own.name,
        jobTitle: own.jobTitle,
        bio: own.bio,
        timeZone: own.timeZone,
        avatarId: own.avatarId,
        preferences: preferenceSchema.parse(own.preferences),
        version: own.version,
      }
    : defaultProfile(actor.name);
  const {
    version,
    name,
    description,
    accent,
    timeZone,
    logoId,
    configuration,
  } = workspace;
  return {
    revision: workspace.revision,
    actor: {
      ...actor,
      name: profile.name,
      image: profile.avatarId
        ? `/api/attachments/${profile.avatarId}/content`
        : actor.image,
    },
    profile,
    settings: {
      ...workspaceFields.parse({
        name,
        description,
        accent,
        timeZone,
        logoId,
        configuration,
      }),
      version,
    },
  };
}
export async function ensureWorkspaceProfile(actor: Actor) {
  if (!actor.isAdmin) return;
  const { db } = await database();
  await assertActorActive(db, actor);
  await db
    .insert(s.member)
    .values({ email: actor.email, name: actor.name })
    .onConflictDoNothing();
}
export async function loadWorkspaceHome(
  actor: Actor,
): Promise<WorkspaceHomeData> {
  const { db } = await database();
  // Mirror Locker Room's first-login admin registration without replacing existing profiles.
  await ensureWorkspaceProfile(actor);
  return db.transaction(
    async (tx) => {
      const experience = await readWorkspaceExperience(tx, actor);
      const result = await tx.execute(
        sql`SELECT (SELECT count(*)::int FROM task WHERE archived=false) AS tasks, (SELECT count(*)::int FROM project) AS locker_projects, (SELECT count(*)::int FROM board_room_project) AS board_projects`,
      );
      const row = result.rows[0];
      const timeZone =
        experience.profile.timeZone || experience.settings.timeZone;
      const today = focusDate(timeZone);
      const taskFocus = await tx.execute(sql`SELECT
        count(*) FILTER (WHERE assignee=${actor.email})::int AS my_open,
        count(*) FILTER (WHERE due_date<${today})::int AS overdue,
        count(*) FILTER (WHERE due_date=${today})::int AS due_today
        FROM task WHERE archived=false AND status<>'done'`);
      const boardFocus = await tx.execute(sql`SELECT
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM attachment f WHERE f.entity_type='boardRoomProject' AND f.entity_id=p.id AND f.state='ready') AND NOT (p.reviewed_revision IS NOT NULL AND p.reviewed_revision=p.document_revision))::int AS needs_review,
        count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM attachment f WHERE f.entity_type='boardRoomProject' AND f.entity_id=p.id AND f.state='ready'))::int AS no_files,
        count(*) FILTER (WHERE coalesce(p.data->>'category','')='' OR p.data->>'codYear' IS NULL OR p.data->>'capacity' IS NULL OR btrim(coalesce(p.data->>'unit',''))='' OR btrim(coalesce(p.data->>'scope',''))='' OR btrim(coalesce(p.data->>'voltage',''))='' OR btrim(coalesce(p.data->>'location',''))='')::int AS incomplete
        FROM board_room_project p`);
      const tasks = taskFocus.rows[0],
        projects = boardFocus.rows[0];
      return {
        ...experience,
        focus: {
          today,
          timeZone,
          myOpen: Number(tasks.my_open),
          overdue: Number(tasks.overdue),
          dueToday: Number(tasks.due_today),
          needsReview: Number(projects.needs_review),
          noFiles: Number(projects.no_files),
          incomplete: Number(projects.incomplete),
        },
        totals: {
          tasks: Number(row.tasks),
          lockerProjects: Number(row.locker_projects),
          boardProjects: Number(row.board_projects),
        },
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
