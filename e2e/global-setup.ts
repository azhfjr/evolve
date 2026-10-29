import { sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { configureTestDatabase } from "../tests/helpers";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
export default async function setup() {
  configureTestDatabase("evolve_e2e");
  const { db, close } = await database();
  try {
    await db.execute(
      sql`UPDATE connected_workspace SET enabled=false WHERE id='primary'`,
    );
    await db.execute(
      sql`TRUNCATE project_template_audit,project_template_sync_receipt,project_template_config,project_template_revision CASCADE`,
    );
    await db.execute(
      sql`INSERT INTO project_template_revision(revision,definition,created_by) VALUES(0,'{"fields":[]}','system'); INSERT INTO project_template_config(id) VALUES('primary')`,
    );
    await db.execute(
      sql`TRUNCATE board_creation_receipt,asset_import_finding,legacy_record,logical_document,asset_history,asset_import_receipt,canonical_import_receipt,meeting_action_link,meeting_pack,workspace_change,personal_project CASCADE`,
    );
    await db.execute(
      sql`TRUNCATE board_room_history, board_room_assignment, board_room_category, board_room_project, attachment, calendar_oauth_state, calendar_job, calendar_event, calendar_connection, task_template, command_receipt, notification, activity, comment, task, project, member, auth_session, auth_account, auth_user, api_rate, auth_rate_limit, auth_verification CASCADE`,
    );
    await db.execute(
      sql`UPDATE workspace_setting SET name='Evolve', description='Private organization workspace',accent='green',time_zone='Asia/Jakarta',logo_id=NULL,configuration='{}'::jsonb,version=1,revision=0 WHERE id='primary'`,
    );
    await db.execute(
      sql`UPDATE board_room_config SET stages='["Stage 1","Stage 2","Stage 3","Stage 4","Stage 5","Stage 6","Stage 7","Stage 8","Stage 9","Stage 10"]'::jsonb,version=1,revision=0 WHERE id='primary'`,
    );
    await db.execute(
      sql`UPDATE operations_state SET data='{"schemaVersion":1}'::jsonb,version=1 WHERE id='primary'`,
    );
    const users = [
      {
        id: "e2e-admin",
        name: "Workspace Admin",
        email: "jarjirjor777@gmail.com",
        emailVerified: true,
      },
      {
        id: "e2e-member",
        name: "Team Member",
        email: "member@example.com",
        emailVerified: true,
      },
      {
        id: "e2e-outsider",
        name: "Outsider",
        email: "outsider@example.com",
        emailVerified: true,
      },
      {
        id: "e2e-unverified",
        name: "Unverified",
        email: "unverified@example.com",
        emailVerified: false,
      },
    ];
    const auth: Record<string, string> = {};
    const secret =
      process.env.BETTER_AUTH_SECRET ||
      "evolve-browser-tests-only-not-a-production-secret";
    for (const user of users) {
      await db.insert(s.user).values(user);
      const token = crypto.randomUUID();
      await db.insert(s.session).values({
        id: crypto.randomUUID(),
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000),
      });
      auth[user.id] = encodeURIComponent(
        token +
          "." +
          createHmac("sha256", secret).update(token).digest("base64"),
      );
    }
    await db.insert(s.member).values(
      users
        .filter((u) => u.id !== "e2e-outsider")
        .map((u) => ({
          email: u.email,
          name: u.name,
          preferences: { locale: "en" as const },
        })),
    );
    const projectId = "20000000-0000-4000-8000-000000000001";
    await db.insert(s.project).values({
      id: projectId,
      name: "Launch planning",
      description: "A real PostgreSQL-backed project",
      color: "violet",
    });
    await db.insert(s.task).values({
      id: "20000000-0000-4000-8000-000000000002",
      title: "Review our launch plan",
      description: "Shared work for the end-to-end tests",
      projectId,
      assignee: "member@example.com",
      priority: "high",
      createdBy: users[0].email,
    });
    await mkdir(".data", { recursive: true });
    await writeFile(".data/e2e-auth.json", JSON.stringify(auth), {
      mode: 0o600,
    });
  } finally {
    await close();
  }
}
