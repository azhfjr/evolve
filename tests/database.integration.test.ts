import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { configureTestDatabase } from "./helpers";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { connectionEntity, queryConnections } from "../src/lib/connections";
import {
  connectionCatalogSchema,
  connectionItemsSchema,
} from "../src/lib/connection-model";
import {
  ensureAdminMember,
  executeCommand,
  loadWorkspace,
  taskDiscussion,
  loadTaskPage,
} from "../src/lib/service";
import type { Actor, Project, Task } from "../src/lib/types";
configureTestDatabase("evolve_test");
const admin: Actor = {
  email: "jarjirjor777@gmail.com",
  name: "Administrator",
  isAdmin: true,
};
const teammate: Actor = {
  email: "teammate@example.com",
  name: "Teammate",
  isAdmin: false,
};
// Financial fixtures represent pre-transition records, not a writable legacy API.
async function seedHistoricalProject(input: Record<string, unknown>) {
  const { projectFields, projectCostFields } =
    await import("../src/lib/project-model");
  const fields = projectCostFields(projectFields.parse(input));
  const created = await executeCommand(admin, {
    ...input,
    budget: "0.00",
    costItems: undefined,
    costOptions: undefined,
  });
  const { db } = await database();
  if (created.project?.version === 1)
    await db
      .update(s.project)
      .set({
        budget: fields.budget,
        currency: fields.currency,
        costItems: fields.costItems ?? null,
        costOptions: fields.costOptions ?? null,
      })
      .where(eq(s.project.id, created.project.id));
  const { projectSummaries } = await import("../src/lib/project-data");
  return {
    ...created,
    project: {
      ...(await projectSummaries(db, created.project!.id))[0],
      createdAt: created.project!.createdAt,
    } as Project,
  };
}
let project: Project;
let task: Task;
before(async () => {
  const { db } = await database();
  await db.execute(
    sql`TRUNCATE attachment, calendar_oauth_state, calendar_job, calendar_event, calendar_connection, task_template, command_receipt, notification, activity, comment, task, project, member, auth_session, auth_account, auth_user, api_rate CASCADE`,
  );
  await db.execute(
    sql`UPDATE workspace_setting SET name='Evolve', description='Private organization workspace',accent='green',time_zone='Asia/Jakarta',logo_id=NULL,configuration='{}'::jsonb,version=1,revision=0 WHERE id='primary'`,
  );
  await ensureAdminMember(admin);
});
after(async () => {
  await (await database()).close();
});

test("the workspace reconnects after the database closes an idle connection", async () => {
  const { db } = await database();
  const result = await db.execute(sql`SELECT pg_backend_pid() AS pid`);
  const pid = result.rows[0].pid as number;
  const controller = new Client({ connectionString: process.env.DATABASE_URL });
  await controller.connect();
  try {
    await controller.query("SELECT pg_terminate_backend($1)", [pid]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const workspace = await loadWorkspace(admin);
    assert.equal(workspace.actor.email, admin.email);
    const next = await db.execute(sql`SELECT pg_backend_pid() AS pid`);
    assert.notEqual(next.rows[0].pid, pid);
  } finally {
    await controller.end();
  }
});
test("admin can create a project and approve a teammate", async () => {
  project = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Integration project",
      description: "Real PostgreSQL",
      color: "green",
    })
  ).project as Project;
  assert.ok(project.id);
  const result = await executeCommand(admin, {
    action: "inviteMember",
    email: teammate.email,
    name: teammate.name,
  });
  assert.equal(result.member?.email, teammate.email);
});
test("ordinary members cannot administer projects or approve new users", async () => {
  await assert.rejects(
    executeCommand(teammate, {
      action: "createProject",
      name: "Unauthorized",
      color: "blue",
    }),
    { status: 403 },
  );
  await assert.rejects(
    executeCommand(teammate, {
      action: "inviteMember",
      email: "other@example.com",
      name: "Other",
    }),
    { status: 403 },
  );
});
test("a shared task is persisted with an assignment notification and audit record", async () => {
  task = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Ship a complete vertical slice",
        projectId: project.id,
        assignee: teammate.email,
        priority: "high",
        dueDate: "2026-12-01",
      },
    })
  ).task as Task;
  assert.equal(task.version, 1);
  const workspace = await loadWorkspace(teammate);
  assert.equal(
    workspace.tasks.find((t) => t.id === task.id)?.title,
    task.title,
  );
  assert.equal(workspace.notifications.length, 1);
  assert.ok(workspace.activities.some((a) => a.taskId === task.id));
});
test("invalid project references roll back without creating a task", async () => {
  await assert.rejects(
    executeCommand(admin, {
      action: "createTask",
      task: { title: "Should never persist", projectId: crypto.randomUUID() },
    }),
    { status: 400 },
  );
  assert.equal(
    (await loadWorkspace(admin)).tasks.some(
      (t) => t.title === "Should never persist",
    ),
    false,
  );
});
test("members can update shared work and completion timestamps are coherent", async () => {
  task = (
    await executeCommand(teammate, {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { status: "done" },
    })
  ).task as Task;
  assert.equal(task.version, 2);
  assert.equal(task.assignee, teammate.email);
  assert.equal(task.projectId, project.id);
  assert.equal(task.priority, "high");
  assert.equal(task.dueDate, "2026-12-01");
  assert.ok(task.completedAt);
  task = (
    await executeCommand(teammate, {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { status: "in_progress" },
    })
  ).task as Task;
  assert.equal(task.completedAt, null);
});
test("stale edits return conflict instead of losing another person’s work", async () => {
  const version = task.version;
  task = (
    await executeCommand(admin, {
      action: "updateTask",
      id: task.id,
      version,
      patch: { title: "Updated by the admin" },
    })
  ).task as Task;
  await assert.rejects(
    executeCommand(teammate, {
      action: "updateTask",
      id: task.id,
      version,
      patch: { title: "Stale edit" },
    }),
    { status: 409 },
  );
  assert.equal(
    (await loadWorkspace(admin)).tasks.find((t) => t.id === task.id)?.title,
    "Updated by the admin",
  );
});
test("checklists and comments persist; HTML is stored as text", async () => {
  const checklist = [
    {
      id: crypto.randomUUID(),
      text: "Verify the end-to-end result",
      done: true,
    },
  ];
  task = (
    await executeCommand(teammate, {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { checklist },
    })
  ).task as Task;
  assert.deepEqual(task.checklist, checklist);
  await executeCommand(teammate, {
    action: "addComment",
    taskId: task.id,
    body: '<script>alert("xss")</script>',
  });
  const discussion = (await taskDiscussion(task.id)) as {
    comments: { body: string }[];
  };
  assert.equal(discussion.comments[0].body, '<script>alert("xss")</script>');
});
test("archiving preserves tasks and comments and is reversible", async () => {
  task = (
    await executeCommand(admin, {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { archived: true },
    })
  ).task as Task;
  assert.equal(
    (await loadWorkspace(admin)).tasks.find((t) => t.id === task.id)?.archived,
    true,
  );
  assert.ok(await taskDiscussion(task.id));
  task = (
    await executeCommand(admin, {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { archived: false },
    })
  ).task as Task;
  assert.equal(task.archived, false);
  assert.equal(task.assignee, teammate.email);
  assert.equal(task.checklist.length, 1);
});
test("read-notification updates are limited to the current recipient", async () => {
  const { db } = await database();
  await db.insert(s.notification).values({
    id: crypto.randomUUID(),
    email: admin.email,
    taskId: task.id,
    message: "Administrator only",
  });
  await executeCommand(teammate, { action: "readNotifications" });
  assert.equal(
    (await loadWorkspace(teammate)).notifications.every((n) => n.read),
    true,
  );
  assert.equal((await loadWorkspace(admin)).notifications[0].read, false);
});
test("admin cannot revoke their own access", async () => {
  await assert.rejects(
    executeCommand(admin, {
      action: "setMemberAccess",
      email: admin.email,
      disabled: true,
    }),
    { status: 400 },
  );
});
test("revoking membership removes sessions and blocks future assignments", async () => {
  const { db } = await database();
  const id = crypto.randomUUID();
  await db.insert(s.user).values({
    id,
    email: teammate.email,
    name: teammate.name,
    emailVerified: true,
  });
  await db.insert(s.session).values({
    id: crypto.randomUUID(),
    userId: id,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 86400000),
  });
  await executeCommand(admin, {
    action: "setMemberAccess",
    email: teammate.email,
    disabled: true,
  });
  assert.equal(
    (await db.select().from(s.session).where(eq(s.session.userId, id))).length,
    0,
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "updateTask",
      id: task.id,
      version: task.version,
      patch: { assignee: teammate.email },
    }),
    { status: 400 },
  );
});
test("cursor pagination includes every task exactly once", async () => {
  const { db } = await database();
  await db.insert(s.task).values(
    Array.from({ length: 505 }, (_, i) => ({
      id: crypto.randomUUID(),
      title: `Pagination task ${i}`,
      createdBy: admin.email,
    })),
  );
  const workspace = await loadWorkspace(admin);
  assert.equal(workspace.tasks.length, 500);
  assert.ok(workspace.nextCursor);
  const page = (await loadTaskPage(workspace.nextCursor!)) as {
    tasks: Task[];
    nextCursor: string | null;
  };
  assert.equal(page.tasks.length, 6);
  assert.equal(page.nextCursor, null);
  assert.equal(
    new Set([...workspace.tasks, ...page.tasks].map((t) => t.id)).size,
    506,
  );
});

test("profile names persist and admin-only workspace changes enforce versions and roles", async () => {
  await executeCommand(admin, {
    action: "setMemberAccess",
    email: teammate.email,
    disabled: false,
  });
  const before = await loadWorkspace(admin);
  const profile = {
    ...before.profile!,
    name: "Jarjir Evolve",
    jobTitle: "Owner",
    bio: "Team workspace",
  };
  await executeCommand(admin, { action: "updateProfile", ...profile });
  await ensureAdminMember({ ...admin, name: "Google display name" });
  assert.equal((await loadWorkspace(admin)).profile?.name, "Jarjir Evolve");
  await assert.rejects(
    executeCommand(admin, { action: "updateProfile", ...profile }),
    { status: 409 },
  );
  await assert.rejects(
    executeCommand(teammate, {
      action: "updateWorkspace",
      ...before.settings!,
      name: "Unauthorized",
    }),
    { status: 403 },
  );
  const updated = await executeCommand(admin, {
    action: "updateWorkspace",
    ...before.settings!,
    name: "Evolve Team",
    accent: "blue",
  });
  assert.equal(updated.settings?.name, "Evolve Team");
  await assert.rejects(
    executeCommand(admin, {
      action: "updateWorkspace",
      ...before.settings!,
      name: "Stale",
    }),
    { status: 409 },
  );
  const member = (await loadWorkspace(admin)).members.find(
    (m) => m.email === teammate.email,
  )!;
  await assert.rejects(
    executeCommand(teammate, {
      action: "updateMember",
      email: admin.email,
      name: "Hacked",
      jobTitle: "",
      version: 1,
    }),
    { status: 403 },
  );
  await executeCommand(admin, {
    action: "updateMember",
    email: member.email,
    name: "Renamed teammate",
    jobTitle: "Designer",
    version: member.version,
  });
  assert.equal(
    (await loadWorkspace(teammate)).profile?.name,
    "Renamed teammate",
  );
});
test("create/import retries are idempotent and invalid import links roll back the whole batch", async () => {
  const { findTask, queryTasks } = await import("../src/lib/task-query");
  const key = crypto.randomUUID();
  const command = {
    action: "createTask",
    task: { title: "Idempotent task" },
    idempotencyKey: key,
  };
  const first = await executeCommand(admin, command),
    retry = await executeCommand(admin, command);
  assert.equal(first.task?.id, retry.task?.id);
  await assert.rejects(
    executeCommand(admin, { ...command, task: { title: "Changed payload" } }),
    { status: 409 },
  );
  assert.equal((await findTask(first.task!.id)).version, 1);
  const batch = {
    action: "importTasks",
    idempotencyKey: crypto.randomUUID(),
    tasks: [{ title: "Import once A" }, { title: "Import once B" }],
  };
  const imported = await executeCommand(admin, batch);
  assert.equal(
    (await executeCommand(admin, batch)).tasks?.[0].id,
    imported.tasks?.[0].id,
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "importTasks",
      idempotencyKey: crypto.randomUUID(),
      tasks: [
        { title: "Never commit import row" },
        { title: "Invalid row", projectId: crypto.randomUUID() },
      ],
    }),
    { status: 400 },
  );
  assert.equal(
    (
      await queryTasks(
        admin,
        new URLSearchParams({ q: "Never commit import row" }),
      )
    ).total,
    0,
  );
});
test("bulk editing is atomic on stale versions and independent tasks complete together", async () => {
  const { findTask } = await import("../src/lib/task-query");
  const rows = [];
  for (const title of ["Bulk A", "Bulk B", "Bulk C"])
    rows.push(
      (await executeCommand(admin, { action: "createTask", task: { title } }))
        .task!,
    );
  await assert.rejects(
    executeCommand(admin, {
      action: "bulkUpdateTasks",
      idempotencyKey: crypto.randomUUID(),
      items: rows.map((t, i) => ({ id: t.id, version: i === 1 ? 2 : 1 })),
      patch: { priority: "urgent" },
    }),
    { status: 409 },
  );
  assert.equal((await findTask(rows[0].id)).priority, "none");
  const result = await executeCommand(admin, {
    action: "bulkUpdateTasks",
    idempotencyKey: crypto.randomUUID(),
    items: rows.map(({ id, version }) => ({ id, version })),
    patch: { status: "done" },
  });
  assert.equal(result.tasks?.length, 3);
  assert.ok(result.tasks?.every((t) => t.status === "done"));
  await assert.rejects(
    executeCommand(admin, {
      action: "updateTask",
      id: rows[0].id,
      version: 1,
      patch: { status: "todo" },
    }),
    { status: 409 },
  );
});
test("removed relationships reject new writes while legacy task data stays editable and can complete", async () => {
  const { db } = await database();
  const { findTask } = await import("../src/lib/task-query");
  const a = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Legacy root" },
    })
  ).task!;
  const b = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Legacy child" },
    })
  ).task!;
  for (const payload of [{ parentId: a.id }, { dependencies: [a.id] }])
    await assert.rejects(
      executeCommand(admin, {
        action: "createTask",
        task: { title: "Rejected new relationship", ...payload },
      }),
    );
  await db.update(s.task).set({ parentId: a.id }).where(eq(s.task.id, b.id));
  await db.execute(
    sql`INSERT INTO task_dependency(task_id,depends_on_id) VALUES(${a.id},${b.id})`,
  );
  const completed = await executeCommand(admin, {
    action: "updateTask",
    id: a.id,
    version: 1,
    patch: { status: "done" },
  });
  assert.equal(completed.task?.status, "done");
  assert.equal((await findTask(b.id)).parentId, a.id);
  assert.deepEqual((await findTask(a.id)).dependencies, [b.id]);
  await assert.rejects(
    executeCommand(admin, {
      action: "updateTask",
      id: b.id,
      version: 1,
      patch: { dependencies: [a.id] },
    }),
  );
});
test("recurrence creates only one successor and preserves the monthly anchor and deadline zone", async () => {
  const { db } = await database();
  const source = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Monthly close",
        dueDate: "2028-01-31",
        dueTime: "09:00",
        dueTimeZone: "Asia/Jayapura",
        recurrence: "monthly",
        checklist: [{ id: crypto.randomUUID(), text: "Close", done: true }],
      },
    })
  ).task!;
  const completed = await executeCommand(admin, {
    action: "updateTask",
    id: source.id,
    version: 1,
    patch: { status: "done" },
  });
  const next = completed.tasks!.find((t) => t.id !== source.id)!;
  assert.equal(next.dueDate, "2028-02-29");
  assert.equal(next.dueTimeZone, "Asia/Jayapura");
  assert.equal(next.checklist[0].done, false);
  const march = await executeCommand(admin, {
    action: "updateTask",
    id: next.id,
    version: 1,
    patch: { status: "done" },
  });
  assert.ok(march.tasks!.some((t) => t.dueDate === "2028-03-31"));
  await executeCommand(admin, {
    action: "updateTask",
    id: source.id,
    version: 2,
    patch: { status: "todo" },
  });
  await executeCommand(admin, {
    action: "updateTask",
    id: source.id,
    version: 3,
    patch: { status: "done" },
  });
  assert.equal(
    (
      await db
        .select()
        .from(s.task)
        .where(eq(s.task.recurrenceSourceId, source.id))
    ).length,
    1,
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Skipped DST",
        dueDate: "2026-03-08",
        dueTime: "02:30",
        dueTimeZone: "America/New_York",
      },
    }),
    { status: 400 },
  );
});
test("templates persist but only their creator or admin can archive them", async () => {
  const template = (
    await executeCommand(admin, {
      action: "saveTemplate",
      name: "Release",
      body: { title: "Release checklist" },
    })
  ).template!;
  const workspace = await loadWorkspace(teammate);
  assert.ok(workspace.templates?.some((t) => t.id === template.id));
  assert.equal(
    workspace.templates?.find((t) => t.id === template.id)?.body,
    undefined,
  );
  await assert.rejects(
    executeCommand(teammate, {
      action: "archiveTemplate",
      id: template.id,
      version: 1,
    }),
    { status: 403 },
  );
  await executeCommand(admin, {
    action: "archiveTemplate",
    id: template.id,
    version: 1,
  });
  assert.ok(
    !(await loadWorkspace(admin)).templates?.some((t) => t.id === template.id),
  );
});
test("private attachment lifecycle enforces file type, ownership, revocation, and abandoned-upload cleanup", async () => {
  const files = await import("../src/lib/attachments");
  const saved = {
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    dir: process.env.EVOLVE_FILES_DIR,
  };
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.EVOLVE_FILES_DIR = ".data/unit-feature-files";
  try {
    const content = Buffer.from("%PDF-1.7\nTest only\n");
    const input = {
      entityType: "project",
      entityId: project.id,
      filename: "Plan.pdf",
      contentType: "application/pdf",
      size: content.length,
    };
    const reservation = await files.reserveAttachment(admin, input);
    await files.writeLocalAttachment(admin, reservation.id, content);
    const ready = await files.finalizeAttachment(admin, reservation.id);
    assert.equal(
      (await files.finalizeAttachment(admin, reservation.id)).id,
      ready.id,
    );
    assert.deepEqual(
      Buffer.from(
        (await files.attachmentContent(
          await files.readAttachment(ready.id),
        )) as Uint8Array,
      ),
      content,
    );
    assert.ok(
      (await files.listAttachments(teammate, "project", project.id)).some(
        (f) => f.id === ready.id,
      ),
    );
    await assert.rejects(files.removeAttachment(teammate, ready.id), {
      status: 403,
    });
    await assert.rejects(
      files.reserveAttachment(admin, { ...input, filename: "../bad.pdf" }),
    );
    await assert.rejects(
      files.reserveAttachment(admin, { ...input, filename: "bad.exe" }),
      { status: 400 },
    );
    await assert.rejects(
      files.reserveAttachment(teammate, {
        ...input,
        entityType: "avatar",
        entityId: admin.email,
        filename: "a.png",
        contentType: "image/png",
      }),
      { status: 403 },
    );
    await executeCommand(admin, {
      action: "setMemberAccess",
      email: teammate.email,
      disabled: true,
    });
    await assert.rejects(
      files.listAttachments(teammate, "project", project.id),
      { status: 403 },
    );
    await executeCommand(admin, {
      action: "setMemberAccess",
      email: teammate.email,
      disabled: false,
    });
    await files.removeAttachment(admin, ready.id);
    await assert.rejects(files.readAttachment(ready.id), { status: 404 });
    const abandoned = await files.reserveAttachment(admin, input);
    const { db } = await database();
    await db
      .update(s.attachment)
      .set({ createdAt: new Date(Date.now() - 7200000) })
      .where(eq(s.attachment.id, abandoned.id));
    await files.cleanupAttachments();
    assert.equal(
      (
        await db
          .select()
          .from(s.attachment)
          .where(eq(s.attachment.id, abandoned.id))
      ).length,
      0,
    );
  } finally {
    if (saved.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = saved.blob;
    if (saved.dir === undefined) delete process.env.EVOLVE_FILES_DIR;
    else process.env.EVOLVE_FILES_DIR = saved.dir;
  }
});
test("Calendar OAuth/worker mocks verify PKCE, account binding, stable events, durable retry and disconnect", async (t) => {
  const calendar = await import("../src/lib/calendar/service");
  const google = await import("../src/lib/calendar/google");
  const worker = await import("../src/lib/calendar/jobs");
  const previous = {
    fetch: globalThis.fetch,
    secret: process.env.BETTER_AUTH_SECRET,
    id: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    url: process.env.BETTER_AUTH_URL,
  };
  process.env.BETTER_AUTH_SECRET =
    "calendar-integration-tests-only-abcdefghijklmnopqrstuvwxyz";
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-only";
  process.env.BETTER_AUTH_URL = "https://evolve.example";
  t.after(() => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [
      ["BETTER_AUTH_SECRET", previous.secret],
      ["GOOGLE_CLIENT_ID", previous.id],
      ["GOOGLE_CLIENT_SECRET", previous.clientSecret],
      ["BETTER_AUTH_URL", previous.url],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  });
  let wrongIdentity = true,
    fail = false,
    created = 0;
  const calls: {
    method: string;
    url: string;
    body?: Record<string, unknown>;
  }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      method = init?.method || "GET";
    if (url.includes("/token"))
      return Response.json({
        access_token: "mock-access",
        refresh_token: "mock-refresh",
        expires_in: 3600,
        scope: google.CALENDAR_SCOPE,
      });
    if (url.includes("/userinfo"))
      return Response.json({
        email: wrongIdentity ? "other@example.com" : teammate.email,
        email_verified: true,
      });
    if (url.endsWith("/calendars"))
      return Response.json({ id: "test-calendar" });
    if (url.includes("/events")) {
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (fail) return Response.json({ error: "unavailable" }, { status: 503 });
      if (method === "PUT" && !created)
        return new Response(null, { status: 404 });
      if (method === "POST") created++;
      return method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json({ id: "event" });
    }
    if (method === "PATCH" && url.includes("/calendars/"))
      calls.push({ url, method, body: JSON.parse(String(init?.body)) });
    return Response.json({ id: "test-calendar" });
  };
  const attempt = await calendar.startCalendarConnection(teammate);
  const authURL = new URL(attempt.url);
  assert.equal(authURL.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    authURL.searchParams.get("redirect_uri"),
    "https://evolve.example/api/calendar/callback",
  );
  await assert.rejects(
    calendar.finishCalendarConnection(
      teammate,
      attempt.state,
      "wrong-cookie",
      "code",
    ),
    { status: 400 },
  );
  await assert.rejects(
    calendar.finishCalendarConnection(
      teammate,
      attempt.state,
      attempt.state,
      "code",
    ),
    { status: 403 },
  );
  await assert.rejects(
    calendar.finishCalendarConnection(
      teammate,
      attempt.state,
      attempt.state,
      "code",
    ),
    { status: 400 },
  );
  wrongIdentity = false;
  const valid = await calendar.startCalendarConnection(teammate);
  await calendar.finishCalendarConnection(
    teammate,
    valid.state,
    valid.state,
    "code",
  );
  const { db } = await database();
  await db.delete(s.calendarJob);
  const source = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Calendar test",
        assignee: teammate.email,
        dueDate: "2026-12-01",
        dueTime: "09:00",
        dueTimeZone: "Asia/Jayapura",
      },
    })
  ).task!;
  await executeCommand(admin, {
    action: "updateTask",
    id: source.id,
    version: 1,
    patch: { title: "Calendar coalesced" },
  });
  assert.equal(await worker.processCalendarJobs(1), 1);
  assert.equal(created, 1);
  const event = calls.find((c) => c.method === "POST")!.body!;
  assert.equal(event.id, google.googleEventId(teammate.email, source.id));
  assert.equal(event.summary, "Calendar coalesced");
  assert.deepEqual(event.start, {
    dateTime: "2026-12-01T00:00:00.000Z",
    timeZone: "Asia/Jayapura",
  });
  const status = await calendar.calendarStatus(teammate);
  assert.equal(status.connected, true);
  assert.equal("accessToken" in status, false);
  const [stored] = await db
    .select()
    .from(s.calendarConnection)
    .where(eq(s.calendarConnection.email, teammate.email));
  assert.ok(!stored.accessToken.includes("mock-access"));
  await executeCommand(admin, {
    action: "updateTask",
    id: source.id,
    version: 2,
    patch: { priority: "high" },
  });
  fail = true;
  assert.equal(await worker.processCalendarJobs(1), 0);
  const [retry] = await db
    .select()
    .from(s.calendarJob)
    .where(eq(s.calendarJob.taskId, source.id));
  assert.equal(retry.attempts, 1);
  assert.ok(+retry.availableAt > Date.now());
  fail = false;
  await db.update(s.calendarJob).set({ availableAt: new Date(0) });
  assert.equal(await worker.processCalendarJobs(1), 1);
  assert.equal(created, 1);
  const explicit = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Unassigned Calendar selection", dueDate: "2026-12-20" },
    })
  ).task!;
  assert.equal(
    (await calendar.taskCalendarStatus(teammate, explicit.id)).selected,
    false,
  );
  const selected = await calendar.setTaskCalendar(teammate, explicit.id, true);
  assert.equal(selected.taskState, "pending");
  assert.equal(selected.selected, true);
  assert.equal(
    (await calendar.taskCalendarStatus(admin, explicit.id)).selected,
    false,
  );
  const otherQueued = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Other queued Calendar task",
        assignee: teammate.email,
        dueDate: "2026-12-21",
      },
    })
  ).task!;
  await worker.startCalendarJobs({
    email: teammate.email,
    taskId: explicit.id,
  });
  assert.equal(
    (await calendar.taskCalendarStatus(teammate, explicit.id)).taskState,
    "synced",
  );
  assert.equal(
    (
      await db
        .select()
        .from(s.calendarJob)
        .where(eq(s.calendarJob.taskId, otherQueued.id))
    ).length,
    1,
  );
  const allDay = calls.filter((c) => c.method === "POST").at(-1)!.body!;
  assert.deepEqual(allDay.reminders, {
    useDefault: false,
    overrides: [
      { method: "popup", minutes: 1440 },
      { method: "popup", minutes: 30 },
    ],
  });
  await calendar.setTaskCalendar(teammate, explicit.id, false);
  await worker.processCalendarJobs(10);
  assert.equal(
    (await calendar.taskCalendarStatus(teammate, explicit.id)).selected,
    false,
  );
  assert.ok(calls.some((c) => c.method === "DELETE"));
  const settings = (await loadWorkspace(admin)).settings!;
  const paused = (
    await executeCommand(admin, {
      action: "updateWorkspace",
      ...settings,
      configuration: { ...settings.configuration, calendarEnabled: false },
    })
  ).settings!;
  await assert.rejects(calendar.setTaskCalendar(teammate, explicit.id, true), {
    status: 503,
  });
  await calendar.queueAllCalendarTasks(db, teammate.email);
  assert.equal(await worker.processCalendarJobs(10), 0);
  await executeCommand(admin, {
    action: "updateWorkspace",
    ...settings,
    version: paused.version,
  });
  await db.delete(s.calendarJob);
  const profile = (await loadWorkspace(teammate)).profile!;
  await executeCommand(teammate, {
    action: "updateProfile",
    ...profile,
    timeZone: "Asia/Singapore",
  });
  await worker.processCalendarJobs(20);
  assert.ok(
    calls.some(
      (call) =>
        call.method === "PATCH" && call.body?.timeZone === "Asia/Singapore",
    ),
  );
  await calendar.disconnectCalendar(teammate);
  const [disconnected] = await db
    .select()
    .from(s.calendarConnection)
    .where(eq(s.calendarConnection.email, teammate.email));
  assert.equal(disconnected.accessToken, "");
  assert.equal(disconnected.refreshToken, "");
  assert.equal(disconnected.enabled, false);
  assert.equal((await calendar.calendarStatus(teammate)).pending, 0);
});
test("PostgreSQL notifications arrive after a committed workspace mutation", async () => {
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
  const { subscribeToChanges } = await import("../src/lib/realtime");
  let resolve!: () => void;
  const delivered = new Promise<void>((r) => {
    resolve = r;
  });
  const subscription = await subscribeToChanges(resolve);
  assert.equal(subscription.connected, true);
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Realtime committed task" },
    });
    await Promise.race([
      delivered,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Realtime did not arrive within 3 seconds")),
          3000,
        );
      }),
    ]);
    assert.ok(performance.now() - started < 3000);
  } finally {
    clearTimeout(timer);
    subscription.unsubscribe();
  }
});
test("server-wide search, aggregates and cursor filters include work beyond the initial 500 rows", async () => {
  const { queryTasks, workspaceStatistics } =
    await import("../src/lib/task-query");
  const { db } = await database();
  const found = await queryTasks(
    admin,
    new URLSearchParams({ q: "Pagination task", limit: "70" }),
  );
  assert.equal(found.total, 505);
  let page = found;
  const ids = new Set(page.tasks.map((task) => task.id));
  while (page.nextCursor) {
    page = await queryTasks(
      admin,
      new URLSearchParams({
        q: "Pagination task",
        limit: "70",
        cursor: page.nextCursor,
      }),
    );
    for (const task of page.tasks) {
      assert.ok(!ids.has(task.id));
      ids.add(task.id);
    }
  }
  assert.equal(ids.size, 505);
  await assert.rejects(
    queryTasks(
      admin,
      new URLSearchParams({
        q: "different",
        limit: "70",
        cursor: found.nextCursor!,
      }),
    ),
    { status: 400 },
  );
  const exact = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Literal 100%_ready" },
    })
  ).task!;
  const literal = await queryTasks(
    admin,
    new URLSearchParams({ q: "100%_ready" }),
  );
  assert.deepEqual(
    literal.tasks.map((t) => t.id),
    [exact.id],
  );
  const stats = await workspaceStatistics(admin, "Asia/Jakarta");
  const totals = await db.execute(
    sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='done')::int AS completed FROM task WHERE NOT archived`,
  );
  assert.equal(stats.total, totals.rows[0].total);
  assert.equal(stats.completed, totals.rows[0].completed);
});
test("export pagination can hold a consistent snapshot while another transaction edits sort keys", async () => {
  const { db } = await database();
  const { queryTasks } = await import("../src/lib/task-query");
  const rows = (
    await executeCommand(admin, {
      action: "importTasks",
      idempotencyKey: crypto.randomUUID(),
      tasks: [
        { title: "Snapshot A" },
        { title: "Snapshot B" },
        { title: "Snapshot C" },
      ],
    })
  ).tasks!;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`,
    );
    const first = await queryTasks(
      admin,
      new URLSearchParams({ q: "Snapshot ", sort: "title", limit: "1" }),
      tx,
    );
    await executeCommand(admin, {
      action: "updateTask",
      id: rows[1].id,
      version: 1,
      patch: { title: "Changed concurrently" },
    });
    const second = await queryTasks(
      admin,
      new URLSearchParams({
        q: "Snapshot ",
        sort: "title",
        limit: "1",
        cursor: first.nextCursor!,
      }),
      tx,
    );
    assert.equal(second.tasks[0].title, "Snapshot B");
    assert.equal(second.total, 3);
  });
  assert.equal(
    (await queryTasks(admin, new URLSearchParams({ q: "Snapshot " }))).total,
    2,
  );
});

test("English preferences persist without overwriting an open profile form", async () => {
  const before = await loadWorkspace(admin);
  const version = before.profile!.version;
  await executeCommand(admin, { action: "setLocale", locale: "en" });
  const changed = await loadWorkspace(admin);
  assert.equal(changed.profile!.preferences.locale, "en");
  assert.equal(changed.profile!.version, version);
  await executeCommand(admin, {
    action: "updateProfile",
    ...before.profile!,
    jobTitle: "Locale-safe profile",
    version,
  });
  const saved = await loadWorkspace(admin);
  assert.equal(saved.profile!.jobTitle, "Locale-safe profile");
  assert.equal(saved.profile!.preferences.locale, "en");
  assert.equal(
    (await loadWorkspace(teammate)).profile!.preferences.locale,
    "en",
  );
  await assert.rejects(
    executeCommand(admin, { action: "setLocale", locale: "id" }),
  );
  await assert.rejects(
    executeCommand(admin, { action: "setLocale", locale: "unsupported" }),
  );
});

test("archived search and counts include old tasks beyond the initial workspace and restore with version checks", async () => {
  const { queryTasks, workspaceStatistics } =
    await import("../src/lib/task-query");
  const { db } = await database();
  const id = "ffffffff-ffff-4fff-bfff-ffffffffffff";
  const title = "Archived discoverability beyond initial page";
  await db.insert(s.task).values({
    id,
    title,
    createdBy: admin.email,
    archived: true,
    updatedAt: new Date("2000-01-01"),
  });
  assert.equal(
    (await loadWorkspace(admin)).tasks.some((t) => t.id === id),
    false,
  );
  assert.equal(
    (await queryTasks(admin, new URLSearchParams({ q: title }))).total,
    0,
  );
  const archived = await queryTasks(
    admin,
    new URLSearchParams({ q: title, archived: "true" }),
  );
  const combined = await queryTasks(
    admin,
    new URLSearchParams({ q: title, archived: "all" }),
  );
  assert.equal(archived.tasks[0].id, id);
  assert.equal(combined.total, 1);
  assert.ok((await workspaceStatistics(admin, "Asia/Jakarta")).archived! >= 1);
  await executeCommand(admin, {
    action: "updateTask",
    id,
    version: archived.tasks[0].version,
    patch: { archived: false },
  });
  await assert.rejects(
    executeCommand(admin, {
      action: "updateTask",
      id,
      version: archived.tasks[0].version,
      patch: { archived: true },
    }),
    { status: 409 },
  );
  assert.equal(
    (await queryTasks(admin, new URLSearchParams({ q: title }))).total,
    1,
  );
  assert.equal(
    (
      await queryTasks(
        admin,
        new URLSearchParams({ q: title, archived: "true" }),
      )
    ).total,
    0,
  );
});

test("project costs retain admin/version rules while retired expenses preserve historical decimal records", async () => {
  const { projectFields } = await import("../src/lib/project-model");
  const { projectLedger } = await import("../src/lib/project-data");
  const fields = projectFields.parse({
    name: "Grid reinforcement",
    currency: "USD",
    budget: "1000.50",
    ownerEmail: teammate.email,
    startDate: "2026-10-01",
    targetDate: "2026-12-31",
    reference: "REN-001",
    location: "Kalimantan",
  });
  await assert.rejects(
    executeCommand(teammate, { action: "createProject", ...fields }),
    { status: 403 },
  );
  const p = (
    await seedHistoricalProject({ action: "createProject", ...fields })
  ).project!;
  const input = {
    action: "addExpense",
    projectId: p.id,
    currency: "USD",
    amount: "0.10",
    description: "Historical study charge",
    category: "engineering",
    bookedOn: "2026-10-16",
    payee: "Grid studies",
    idempotencyKey: crypto.randomUUID(),
  };
  const { expense } = await seedHistoricalExpense(input);
  await seedHistoricalExpense({ ...input, amount: "0.20" });
  for (const actor of [admin, teammate]) {
    await assert.rejects(executeCommand(actor, input), { status: 410 });
    await assert.rejects(
      executeCommand(actor, {
        action: "setExpenseVoided",
        id: expense.id,
        version: 1,
        voided: true,
      }),
      { status: 410 },
    );
  }
  const ledger = await projectLedger(p.id);
  assert.equal(ledger.project.spent, "0.30");
  assert.equal(ledger.expenses.length, 2);
  assert.ok(
    ledger.expenses.every(
      (entry: { version: number; voided: boolean }) =>
        entry.version === 1 && !entry.voided,
    ),
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "updateProject",
      ...fields,
      id: p.id,
      version: 1,
      budget: "2000",
    }),
    { status: 410 },
  );
  await executeCommand(admin, {
    action: "updateProject",
    ...fields,
    id: p.id,
    version: 1,
    name: "Renamed historical project",
  });
  await assert.rejects(
    executeCommand(admin, {
      action: "updateProject",
      ...fields,
      id: p.id,
      version: 1,
    }),
    { status: 409 },
  );
  await assert.rejects(
    seedHistoricalProject({
      action: "createProject",
      ...fields,
      budget: "0",
      targetDate: "2026-09-01",
    }),
    { status: 400 },
  );
});
test("saved views are private to their owner and preserve the complete task filter", async () => {
  const filters = {
    scope: "tasks",
    q: "Grid",
    priority: "high",
    dueBucket: "overdue",
    sort: "due",
    view: "board",
  };
  const saved = (
    await executeCommand(teammate, {
      action: "createSavedView",
      name: "My grid review",
      filters,
    })
  ).savedView!;
  assert.ok(
    (await loadWorkspace(teammate)).savedViews?.some((v) => v.id === saved.id),
  );
  assert.ok(
    !(await loadWorkspace(admin)).savedViews?.some((v) => v.id === saved.id),
  );
  await assert.rejects(
    executeCommand(admin, { action: "deleteSavedView", id: saved.id }),
    { status: 404 },
  );
  await assert.rejects(
    executeCommand(teammate, {
      action: "createSavedView",
      name: "My grid review",
      filters,
    }),
    { status: 409 },
  );
  await executeCommand(teammate, { action: "deleteSavedView", id: saved.id });
});
test("workspace controls enforce member task pause, invitation domains, and administrator-only operations", async () => {
  const settings = (await loadWorkspace(admin)).settings!;
  await assert.rejects(
    executeCommand(teammate, { action: "updateWorkspace", ...settings }),
    { status: 403 },
  );
  const next = (
    await executeCommand(admin, {
      action: "updateWorkspace",
      ...settings,
      timeZone: "Asia/Makassar",
      configuration: {
        ...settings.configuration,
        readOnly: true,
        allowedInviteDomains: ["pln.co.id"],
        fontScale: "large",
        sidebarWidth: 320,
      },
    })
  ).settings!;
  await assert.rejects(
    executeCommand(teammate, {
      action: "createTask",
      task: { title: "Paused member write" },
    }),
    { status: 403 },
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "inviteMember",
      email: "unapproved@example.net",
      name: "Unapproved",
    }),
    { status: 400 },
  );
  const approved = await executeCommand(admin, {
    action: "inviteMember",
    email: "planner@pln.co.id",
    name: "Planner",
  });
  assert.equal(approved.member?.timeZone, "Asia/Makassar");
  const own = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Admin maintenance write" },
    })
  ).task!;
  assert.ok(own.id);
  const { administrationReport } = await import("../src/lib/workspace-reports");
  await assert.rejects(administrationReport(teammate), { status: 403 });
  const report = await administrationReport(admin);
  assert.ok(Array.isArray(report.sessions));
  assert.equal("token" in (report.sessions[0] || {}), false);
  await executeCommand(admin, {
    action: "updateWorkspace",
    ...settings,
    version: next.version,
  });
});
test("dashboard and deadline drilldowns cover the full database, and activity uses stable filter-bound pagination", async () => {
  const { db } = await database();
  await db.insert(s.activity).values(
    Array.from({ length: 3 }, (_, index) => ({
      id: crypto.randomUUID(),
      actor: admin.email,
      kind: "finance",
      message: `Historical finance pagination ${index}`,
    })),
  );
  const { dashboardReport, activityReport } =
    await import("../src/lib/workspace-reports");
  const { queryTasks } = await import("../src/lib/task-query");
  const report = await dashboardReport(admin, 7);
  const all = await queryTasks(admin, new URLSearchParams());
  assert.equal(report.totals.total, all.total);
  assert.equal(report.trend.length, 7);
  assert.equal(report.totals.completed, report.statuses.done);
  const past = await queryTasks(
    admin,
    new URLSearchParams({ dueBucket: "overdue" }),
  );
  assert.equal(past.total, report.totals.overdue);
  assert.ok(
    past.tasks.every((t) => t.status !== "done" && t.dueDate! < report.today),
  );
  const first = await activityReport(
    admin,
    new URLSearchParams({ limit: "1", kind: "finance" }),
  );
  assert.ok(first.total >= 3);
  assert.equal(first.activities.length, 1);
  const second = await activityReport(
    admin,
    new URLSearchParams({
      limit: "1",
      kind: "finance",
      cursor: first.nextCursor!,
    }),
  );
  assert.notEqual(first.activities[0].id, second.activities[0].id);
  await assert.rejects(
    activityReport(
      admin,
      new URLSearchParams({
        limit: "1",
        kind: "task",
        cursor: first.nextCursor!,
      }),
    ),
    { status: 400 },
  );
  await assert.rejects(
    activityReport(
      admin,
      new URLSearchParams({ from: "2026-12-01", to: "2026-01-01" }),
    ),
    { status: 400 },
  );
});

test("project labels persist, enforce administrator editing and survive legacy updates", async () => {
  const created = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Connection permissions",
      labels: [" MapLink ", "maplink"],
    })
  ).project!;
  assert.deepEqual(created.labels, ["maplink"]);
  const { projectFields } = await import("../src/lib/project-model");
  const fields = projectFields.parse(created);
  await assert.rejects(
    executeCommand(teammate, {
      ...fields,
      action: "updateProject",
      id: created.id,
      version: created.version,
      labels: ["Unauthorized"],
    }),
    { status: 403 },
  );
  const { labels: _, ...legacy } = fields;
  void _;
  const updated = (
    await executeCommand(admin, {
      ...legacy,
      action: "updateProject",
      id: created.id,
      version: created.version,
    })
  ).project!;
  assert.deepEqual(updated.labels, ["maplink"]);
  const rows = await (
    await database()
  ).db
    .select()
    .from(s.project)
    .where(eq(s.project.id, created.id));
  assert.deepEqual(rows[0].labels, ["maplink"]);
});

test("Connection queries cover work beyond bootstrap, normalize labels and bind page cursors", async () => {
  const { db } = await database();
  const linkedProject = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Map pagination project",
      labels: ["ＭＡＰ   pagination"],
    })
  ).project!;
  const rows = Array.from({ length: 510 }, (_, index) => ({
    id: crypto.randomUUID(),
    title: `Connection pagination ${index}`,
    projectId: linkedProject.id,
    labels: ["Retired task only"],
    createdBy: admin.email,
  }));
  await db.insert(s.task).values(rows);
  await db.insert(s.task).values({
    id: crypto.randomUUID(),
    title: "Hidden archived map entry",
    projectId: linkedProject.id,
    labels: ["Retired task only"],
    archived: true,
    createdBy: admin.email,
  });
  const catalog = connectionCatalogSchema.parse(
    await queryConnections(
      admin,
      new URLSearchParams({ mode: "catalog", q: "map_pagination" }),
    ),
  );
  assert.equal(catalog.groups[0].taskCount, 510);
  assert.equal(catalog.groups[0].projectCount, 1);
  const inclusive = connectionItemsSchema.parse(
    await queryConnections(
      admin,
      new URLSearchParams({
        mode: "items",
        label: "map_pagination",
        includeArchived: "true",
      }),
    ),
  );
  assert.equal(inclusive.total, 512);

  let cursor: string | null = null;
  const ids = new Set<string>();
  do {
    const params = new URLSearchParams({
      mode: "items",
      label: "map_pagination",
      limit: "50",
    });
    if (cursor) params.set("cursor", cursor);
    const page = connectionItemsSchema.parse(
      await queryConnections(admin, params),
    );
    assert.equal(page.total, 511);
    assert.deepEqual(
      page.parents.map((parent) => parent.id),
      page.items.some((item) => item.kind === "project")
        ? []
        : [linkedProject.id],
    );
    for (const item of page.items) {
      assert.equal(
        item.projectId,
        item.kind === "task" ? linkedProject.id : null,
      );
      assert.ok(!ids.has(item.kind + item.id));
      ids.add(item.kind + item.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.size, 511);
  assert.ok(ids.has("project" + linkedProject.id));
  const bootstrap = await loadWorkspace(admin);
  assert.ok(bootstrap.tasks.length <= 500);
  assert.ok(
    rows.some((row) => !bootstrap.tasks.some((task) => task.id === row.id)),
  );
  const first = connectionItemsSchema.parse(
    await queryConnections(
      admin,
      new URLSearchParams({
        mode: "items",
        label: "map_pagination",
        limit: "1",
      }),
    ),
  );
  await assert.rejects(
    queryConnections(
      admin,
      new URLSearchParams({
        mode: "items",
        label: "different",
        limit: "1",
        cursor: first.nextCursor!,
      }),
    ),
    { status: 400 },
  );
  const memberPage = connectionItemsSchema.parse(
    await queryConnections(
      teammate,
      new URLSearchParams({ mode: "items", label: "map_pagination" }),
    ),
  );
  assert.equal(memberPage.total, 511);
});

test("Connection hierarchy includes contextual projects for filtered and paged tasks without changing result counts", async () => {
  const { db } = await database();
  const projectIds = [crypto.randomUUID(), crypto.randomUUID()];
  await db.insert(s.project).values(
    projectIds.map((id, index) => ({
      id,
      name: `Context owner ${index}`,
      labels: [" ＃ＨＩＥＲＡＲＣＨＹ ", "İCONTEXT"],
    })),
  );
  const tasks = Array.from({ length: 3 }, (_, index) => ({
    id: crypto.randomUUID(),
    title: `Hierarchy child ${index}`,
    projectId: projectIds[index === 2 ? 1 : 0],
    archived: index === 2,
    labels: ["retired_task_label"],
    createdBy: admin.email,
  }));
  await db.insert(s.task).values(tasks);
  const read = async (filters: Record<string, string>) =>
    connectionItemsSchema.parse(
      await queryConnections(
        admin,
        new URLSearchParams({ mode: "items", label: "hierarchy", ...filters }),
      ),
    );
  for (const filters of [{ type: "task" }, { q: "Hierarchy child" }] as Record<
    string,
    string
  >[]) {
    const page = await read(filters);
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 2);
    assert.equal(page.nextCursor, null);
    assert.ok(page.items.every((item) => item.projectId === projectIds[0]));
    assert.deepEqual(
      page.parents.map((parent) => parent.id),
      [projectIds[0]],
    );
    assert.equal(page.parents[0].kind, "project");
    assert.equal(page.parents[0].projectId, null);
    assert.equal(page.parents[0].title, "Context owner 0");
    assert.deepEqual(page.parents[0].labels, ["hierarchy", "i\u0307context"]);
  }
  assert.equal(
    (await read({ type: "task", includeArchived: "true" })).parents.length,
    2,
  );
  assert.deepEqual((await read({ type: "project" })).parents, []);
  assert.deepEqual((await read({})).parents, []);
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await read({ limit: "1", ...(cursor ? { cursor } : {}) });
    assert.equal(page.total, 4);
    assert.equal(page.items.length, 1);
    const item = page.items[0];
    assert.ok(!seen.has(`${item.kind}:${item.id}`));
    seen.add(`${item.kind}:${item.id}`);
    assert.deepEqual(
      page.parents.map((parent) => parent.id),
      item.kind === "task" ? [item.projectId] : [],
    );
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.size, 4);
  assert.deepEqual((await read({ q: "no matching title" })).parents, []);
  assert.equal(
    (await connectionEntity(admin, "project", projectIds[0])).projectId,
    null,
  );
  assert.equal(
    (await connectionEntity(admin, "task", tasks[0].id)).projectId,
    projectIds[0],
  );
  const orphan = crypto.randomUUID();
  await db
    .insert(s.task)
    .values({ id: orphan, title: "No project", createdBy: admin.email });
  assert.equal((await connectionEntity(admin, "task", orphan)).projectId, null);
});

test("named mixed-currency costs persist atomically, preserve legacy updates and aggregate the entire expense ledger", async () => {
  const { db } = await database();
  await db.delete(s.apiRate);
  const { projectFields, costTotals } =
    await import("../src/lib/project-model");
  const { projectLedger } = await import("../src/lib/project-data");
  const costItems = [
    {
      id: crypto.randomUUID(),
      title: "Engineering",
      currency: "USD" as const,
      amount: "0.10",
    },
    {
      id: crypto.randomUUID(),
      title: "Equipment",
      currency: "IDR" as const,
      amount: "1250000.50",
    },
    {
      id: crypto.randomUUID(),
      title: "Review",
      currency: "USD" as const,
      amount: "0.20",
    },
  ];
  const fields = projectFields.parse({
    name: "Mixed cost project",
    currency: "USD",
    budget: "999",
    costItems,
  });
  await assert.rejects(
    executeCommand(teammate, { action: "createProject", ...fields }),
    { status: 403 },
  );
  const p = (
    await seedHistoricalProject({ action: "createProject", ...fields })
  ).project!;
  assert.equal(p.budget, "0.30");
  assert.deepEqual(p.costItems, costItems);
  assert.deepEqual(costTotals(p.costItems!), [
    { currency: "IDR", amount: "1250000.50" },
    { currency: "USD", amount: "0.30" },
  ]);
  const { costItems: omitted, ...legacy } = fields;
  void omitted;
  const saved = (
    await executeCommand(admin, {
      action: "updateProject",
      ...legacy,
      budget: p.budget,
      id: p.id,
      version: 1,
      name: "Renamed cost project",
    })
  ).project!;
  assert.deepEqual(saved.costItems, costItems);
  await assert.rejects(
    executeCommand(admin, {
      action: "updateProject",
      ...legacy,
      budget: "123",
      id: p.id,
      version: 2,
    }),
    { status: 410 },
  );
  await db.insert(s.projectExpense).values(
    Array.from({ length: 81 }, (_, i) => ({
      id: crypto.randomUUID(),
      projectId: p.id,
      currency: i === 80 ? ("IDR" as const) : ("USD" as const),
      amount: i === 80 ? "100.00" : "0.10",
      description: `Paged expense ${i}`,
      category: "engineering" as const,
      bookedOn: "2026-10-17",
      createdBy: admin.email,
    })),
  );
  let ledger = await projectLedger(p.id);
  assert.equal(ledger.expenses.length, 50);
  assert.ok(ledger.nextCursor);
  assert.equal(ledger.project.spent, "8.00");
  assert.deepEqual(ledger.project.spentByCurrency, [
    { currency: "IDR", amount: "100.00" },
    { currency: "USD", amount: "8.00" },
  ]);
  const command = {
    action: "addExpense",
    projectId: p.id,
    currency: "IDR",
    amount: "0.25",
    description: "Mixed currency charge",
    category: "other",
    bookedOn: "2026-10-17",
    idempotencyKey: crypto.randomUUID(),
  };
  await assert.rejects(executeCommand(admin, command), { status: 410 });
  await assert.rejects(executeCommand(admin, command), { status: 410 });
  ledger = await projectLedger(p.id);
  assert.deepEqual(ledger.project.spentByCurrency, [
    { currency: "IDR", amount: "100.00" },
    { currency: "USD", amount: "8.00" },
  ]);
  await assert.rejects(
    executeCommand(admin, {
      action: "updateProject",
      ...fields,
      id: p.id,
      version: 2,
      currency: "IDR",
    }),
    { status: 410 },
  );
  assert.equal((await projectLedger(p.id)).project.budget, "0.30");
  assert.equal(
    (await projectLedger(p.id)).expenses.find(
      (e: { currency: string }) => e.currency === "USD",
    )?.currency,
    "USD",
  );
});

test("private task draft uploads are owner-only, expire safely and attach atomically with idempotent task creation", async () => {
  const { db } = await database();
  await db.delete(s.apiRate);
  const files = await import("../src/lib/attachments");
  const oldProvider = process.env.BLOB_READ_WRITE_TOKEN,
    oldDir = process.env.EVOLVE_FILES_DIR;
  const previousDraftFlag = process.env.EVOLVE_DISABLE_TASK_DRAFT_UPLOADS;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.EVOLVE_FILES_DIR = ".data/unit-draft-files";
  try {
    const draftId = crypto.randomUUID(),
      content = Buffer.from("Private draft brief");
    process.env.EVOLVE_DISABLE_TASK_DRAFT_UPLOADS = "1";
    await assert.rejects(
      files.reserveAttachment(admin, {
        entityType: "taskDraft",
        entityId: draftId,
        filename: "Disabled.txt",
        contentType: "text/plain",
        size: content.length,
      }),
      { status: 503 },
    );
    delete process.env.EVOLVE_DISABLE_TASK_DRAFT_UPLOADS;
    const reservation = await files.reserveAttachment(admin, {
      entityType: "taskDraft",
      entityId: draftId,
      filename: "Brief.txt",
      contentType: "text/plain",
      size: content.length,
    });
    await files.writeLocalAttachment(admin, reservation.id, content);
    const ready = await files.finalizeAttachment(admin, reservation.id);
    assert.equal(
      (await files.listAttachments(admin, "taskDraft", draftId)).length,
      1,
    );
    assert.equal(
      (await files.listAttachments(teammate, "taskDraft", draftId)).length,
      0,
    );
    await assert.rejects(files.readAttachment(ready.id, teammate), {
      status: 404,
    });
    await assert.rejects(
      files.removeAttachment({ ...teammate, isAdmin: true }, ready.id, draftId),
      { status: 403 },
    );
    const command = {
      action: "createTask",
      task: { title: "Task with original draft file" },
      idempotencyKey: draftId,
      attachmentIds: [ready.id],
    };
    await assert.rejects(executeCommand(teammate, command), { status: 409 });
    await assert.rejects(
      executeCommand(admin, {
        ...command,
        idempotencyKey: crypto.randomUUID(),
      }),
      { status: 409 },
    );
    assert.equal(
      (
        await db
          .select({ id: s.task.id })
          .from(s.task)
          .where(eq(s.task.title, "Task with original draft file"))
      ).length,
      0,
    );
    const created = (await executeCommand(admin, command)).task!;
    assert.equal((await executeCommand(admin, command)).task!.id, created.id);
    assert.equal(
      (await files.listAttachments(teammate, "task", created.id))[0].id,
      ready.id,
    );
    assert.equal(
      (await files.listAttachments(admin, "taskDraft", draftId)).length,
      0,
    );
    await assert.rejects(files.removeAttachment(admin, ready.id, draftId), {
      status: 409,
    });
    const stale = await files.reserveAttachment(admin, {
      entityType: "taskDraft",
      entityId: crypto.randomUUID(),
      filename: "Expired.txt",
      contentType: "text/plain",
      size: content.length,
    });
    await files.writeLocalAttachment(admin, stale.id, content);
    await files.finalizeAttachment(admin, stale.id);
    await db
      .update(s.attachment)
      .set({ createdAt: new Date(Date.now() - 86400001) })
      .where(eq(s.attachment.id, stale.id));
    await files.cleanupAttachments();
    await assert.rejects(files.readAttachment(stale.id, admin), {
      status: 404,
    });
    assert.equal(
      (await files.readAttachment(ready.id, teammate)).entityId,
      created.id,
    );
  } finally {
    if (oldProvider === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = oldProvider;
    if (oldDir === undefined) delete process.env.EVOLVE_FILES_DIR;
    else process.env.EVOLVE_FILES_DIR = oldDir;
    if (previousDraftFlag === undefined)
      delete process.env.EVOLVE_DISABLE_TASK_DRAFT_UPLOADS;
    else process.env.EVOLVE_DISABLE_TASK_DRAFT_UPLOADS = previousDraftFlag;
  }
});

test("file inventory and bulk removal enforce admin scope, draft privacy, image references and late-upload cleanup", async () => {
  const files = await import("../src/lib/attachments");
  const { fileInventory, deleteManagedFiles } =
    await import("../src/lib/file-management");
  const { mkdir, writeFile, access } = await import("node:fs/promises");
  const { resolve, dirname } = await import("node:path");
  const { db } = await database();
  const oldToken = process.env.BLOB_READ_WRITE_TOKEN,
    oldDir = process.env.EVOLVE_FILES_DIR;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.EVOLVE_FILES_DIR = ".data/unit-managed-files";
  try {
    await db.delete(s.apiRate);
    const content = Buffer.from("Private inventory fixture");
    const draft = await files.reserveAttachment(teammate, {
      entityType: "taskDraft",
      entityId: crypto.randomUUID(),
      filename: "Inventory 100%_private.txt",
      contentType: "text/plain",
      size: content.length,
    });
    await files.writeLocalAttachment(teammate, draft.id, content);
    await files.finalizeAttachment(teammate, draft.id);
    const inventory = await fileInventory(admin, {
      q: "100%_private",
      limit: 1,
    });
    assert.equal(inventory.total, 1);
    assert.equal(inventory.items[0].id, draft.id);
    assert.equal(inventory.items[0].readable, false);
    assert.equal(inventory.items[0].ownerEmail, teammate.email);
    assert.ok(inventory.usage.count > inventory.items.length);
    assert.ok(inventory.usage.bytes >= content.length);
    await assert.rejects(files.readAttachment(draft.id, admin), {
      status: 404,
    });
    await assert.rejects(fileInventory(teammate, {}), { status: 403 });
    await assert.rejects(deleteManagedFiles(teammate, { ids: [draft.id] }), {
      status: 403,
    });
    await assert.rejects(fileInventory({ ...teammate, isAdmin: true }, {}), {
      status: 403,
    });
    await assert.rejects(
      deleteManagedFiles(admin, { ids: [draft.id, draft.id] }),
    );
    await assert.rejects(
      deleteManagedFiles(admin, {
        ids: Array.from({ length: 101 }, () => crypto.randomUUID()),
      }),
    );
    // References are set directly as a controlled fixture; no image decoding is under test.
    const avatarId = crypto.randomUUID(),
      logoId = crypto.randomUUID();
    await db.insert(s.attachment).values(
      [avatarId, logoId].map((id, i) => ({
        id,
        entityType: i ? "workspace" : "avatar",
        entityId: i ? "primary" : teammate.email,
        ownerEmail: admin.email,
        filename: `Inventory image ${i}.png`,
        contentType: "image/png",
        size: 24,
        storagePath: `evolve-files/${id}/image`,
        state: "ready",
      })),
    );
    await db
      .update(s.member)
      .set({ avatarId })
      .where(eq(s.member.email, teammate.email));
    await db
      .update(s.workspaceSetting)
      .set({ logoId })
      .where(eq(s.workspaceSetting.id, "primary"));
    const before = await loadWorkspace(admin);
    const removed = await deleteManagedFiles(admin, {
      ids: [draft.id, avatarId, logoId],
    });
    assert.equal(removed.removed, 3);
    assert.equal(removed.pendingCleanup, 3);
    assert.ok(
      removed.references.profiles.some((p) => p.email === teammate.email),
    );
    const after = await loadWorkspace(admin);
    assert.equal(
      after.members.find((m) => m.email === teammate.email)?.avatarId,
      null,
    );
    assert.equal(after.settings!.logoId, null);
    assert.equal(after.settings!.version, before.settings!.version + 1);
    await assert.rejects(files.readAttachment(draft.id, teammate), {
      status: 404,
    });
    await assert.rejects(files.finalizeAttachment(teammate, draft.id), {
      status: 404,
    });
    const tombstone = (
      await db.select().from(s.attachment).where(eq(s.attachment.id, draft.id))
    )[0];
    assert.equal(tombstone.state, "deleting");
    // Emulate a Blob transfer that was already authorized before deletion.
    const path = resolve(process.env.EVOLVE_FILES_DIR!, tombstone.storagePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    await files.cleanupAttachments();
    assert.equal(
      (
        await db
          .select()
          .from(s.attachment)
          .where(eq(s.attachment.id, draft.id))
      ).length,
      1,
    );
    await db
      .update(s.attachment)
      .set({ createdAt: new Date(Date.now() - 71 * 60000) })
      .where(eq(s.attachment.id, draft.id));
    await files.cleanupAttachments();
    await assert.rejects(access(path));
    assert.equal(
      (
        await db
          .select()
          .from(s.attachment)
          .where(eq(s.attachment.id, draft.id))
      ).length,
      0,
    );
    const retry = await deleteManagedFiles(admin, { ids: [draft.id] });
    assert.equal(retry.alreadyRemoved, 1);
    assert.equal(retry.pendingCleanup, 0);
  } finally {
    if (oldToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = oldToken;
    if (oldDir === undefined) delete process.env.EVOLVE_FILES_DIR;
    else process.env.EVOLVE_FILES_DIR = oldDir;
  }
});

test("connection label edits preserve project costs and task details and reject stale or unauthorized updates", async () => {
  const { connectionEntity } = await import("../src/lib/connections");
  const created = (
    await seedHistoricalProject({
      action: "createProject",
      name: "Labels-only project",
      color: "green",
      description: "Preserve this description",
      labels: ["Graph fixture"],
      budget: "1234.50",
      currency: "USD",
    })
  ).project!;
  const entity = await connectionEntity(admin, "project", created.id);
  const updated = (
    await executeCommand(admin, {
      action: "updateConnectionLabels",
      kind: "project",
      id: entity.id,
      version: entity.version,
      labels: ["Graph fixture", "Updated label"],
    })
  ).project!;
  assert.equal(updated.budget, created.budget);
  assert.equal(updated.currency, created.currency);
  assert.deepEqual(updated.costItems, created.costItems);
  assert.equal(updated.description, created.description);
  await assert.rejects(
    executeCommand(admin, {
      action: "updateConnectionLabels",
      kind: "project",
      id: entity.id,
      version: entity.version,
      labels: ["Stale overwrite"],
    }),
    { status: 409 },
  );
  await assert.rejects(
    executeCommand(teammate, {
      action: "updateConnectionLabels",
      kind: "project",
      id: entity.id,
      version: updated.version,
      labels: ["Denied"],
    }),
    { status: 403 },
  );
  const task = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Labels-only task",
        description: "Keep task contents",
        projectId: created.id,
        priority: "high",
      },
    })
  ).task!;
  await assert.rejects(
    executeCommand(teammate, {
      action: "updateConnectionLabels",
      kind: "task",
      id: task.id,
      version: task.version,
      labels: ["Graph fixture", "Team label"],
    }),
    /managed on the project/i,
  );
  const result = await connectionEntity(admin, "task", task.id);
  assert.deepEqual(result.labels, updated.labels);
  assert.equal(result.version, task.version);
  const { findTask } = await import("../src/lib/task-query");
  const unchanged = await findTask(task.id);
  assert.equal(unchanged.description, task.description);
  assert.equal(unchanged.priority, task.priority);
  const { db } = await database();
  const [settings] = await db
    .select()
    .from(s.workspaceSetting)
    .where(eq(s.workspaceSetting.id, "primary"));
  await db
    .update(s.workspaceSetting)
    .set({ configuration: { ...settings.configuration, readOnly: true } })
    .where(eq(s.workspaceSetting.id, "primary"));
  try {
    await assert.rejects(
      executeCommand(teammate, {
        action: "updateConnectionLabels",
        kind: "task",
        id: task.id,
        version: result.version,
        labels: ["Denied in read-only"],
      }),
      { status: 403 },
    );
  } finally {
    await db
      .update(s.workspaceSetting)
      .set({ configuration: settings.configuration })
      .where(eq(s.workspaceSetting.id, "primary"));
  }
});

test("only the sole administrator can delete selected journal entries without deleting their tasks or comments", async () => {
  const { db } = await database();
  const original = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Activity removal fixture" },
    })
  ).task!;
  await executeCommand(teammate, {
    action: "addComment",
    taskId: original.id,
    body: "Keep this discussion",
  });
  const rows = await db
    .select()
    .from(s.activity)
    .where(eq(s.activity.taskId, original.id));
  assert.ok(rows.length >= 2);
  const ids = rows.map((a) => a.id);
  await assert.rejects(
    executeCommand(teammate, { action: "deleteActivities", ids }),
    { status: 403 },
  );
  await assert.rejects(
    executeCommand(
      { ...teammate, isAdmin: true },
      { action: "deleteActivities", ids },
    ),
    { status: 403 },
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "deleteActivities",
      ids: [ids[0], ids[0]],
    }),
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "deleteActivities",
      ids: Array.from({ length: 101 }, () => crypto.randomUUID()),
    }),
  );
  const one = await executeCommand(admin, {
    action: "deleteActivities",
    ids: [ids[0]],
  });
  assert.deepEqual(one.deletedActivityIds, [ids[0]]);
  assert.equal(
    (await db.select().from(s.activity).where(eq(s.activity.id, ids[1])))
      .length,
    1,
  );
  const remaining = ids.slice(1);
  const bulk = await executeCommand(admin, {
    action: "deleteActivities",
    ids: [...remaining, crypto.randomUUID()],
  });
  assert.deepEqual(bulk.deletedActivityIds?.sort(), remaining.sort());
  assert.deepEqual(
    (await executeCommand(admin, { action: "deleteActivities", ids }))
      .deletedActivityIds,
    [],
  );
  assert.equal(
    (await db.select().from(s.task).where(eq(s.task.id, original.id)))[0].title,
    original.title,
  );
  assert.equal(
    (
      await db.select().from(s.comment).where(eq(s.comment.taskId, original.id))
    )[0].body,
    "Keep this discussion",
  );
});

test("task deletion is admin-only, versioned, retryable and preserves related work", async () => {
  const { db } = await database();
  await db.delete(s.apiRate);
  const source = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Delete only this task" },
    })
  ).task!;
  const other = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Keep related work" },
    })
  ).task!;
  await db
    .update(s.task)
    .set({ parentId: source.id, recurrenceSourceId: source.id })
    .where(eq(s.task.id, other.id));
  await db
    .insert(s.taskDependency)
    .values({ taskId: other.id, dependsOnId: source.id });
  await db.insert(s.comment).values({
    id: crypto.randomUUID(),
    taskId: source.id,
    author: admin.email,
    body: "Remove with task",
  });
  const fileId = crypto.randomUUID();
  await db.insert(s.attachment).values({
    id: fileId,
    entityType: "task",
    entityId: source.id,
    ownerEmail: admin.email,
    filename: "delete.txt",
    contentType: "text/plain",
    size: 4,
    storagePath: `evolve-files/${fileId}/txt`,
    state: "ready",
  });
  const cmd = {
    action: "deleteTask",
    id: source.id,
    version: source.version,
    idempotencyKey: crypto.randomUUID(),
  };
  await assert.rejects(
    executeCommand(
      { email: "outsider@example.com", name: "Outsider", isAdmin: false },
      cmd,
    ),
    { status: 403 },
  );
  await assert.rejects(
    executeCommand(
      { email: "forged@example.com", name: "Forged", isAdmin: true },
      cmd,
    ),
    { status: 403 },
  );
  await assert.rejects(
    executeCommand(admin, { ...cmd, version: source.version + 1 }),
    { status: 409 },
  );
  assert.equal(
    (await db.select().from(s.attachment).where(eq(s.attachment.id, fileId)))[0]
      .state,
    "ready",
  );
  const removed = await executeCommand(admin, cmd);
  assert.equal(removed.deletedTaskId, source.id);
  assert.deepEqual(await executeCommand(admin, cmd), removed);
  assert.equal(
    (await db.select().from(s.task).where(eq(s.task.id, source.id))).length,
    0,
  );
  assert.equal(
    (await db.select().from(s.comment).where(eq(s.comment.taskId, source.id)))
      .length,
    0,
  );
  assert.equal(
    (await db.select().from(s.attachment).where(eq(s.attachment.id, fileId)))[0]
      .state,
    "deleting",
  );
  const kept = (
    await db.select().from(s.task).where(eq(s.task.id, other.id))
  )[0];
  assert.equal(kept.title, other.title);
  assert.equal(kept.parentId, null);
  assert.equal(kept.recurrenceSourceId, null);
  assert.equal(kept.version, other.version + 1);
  assert.equal(
    (
      await db
        .select()
        .from(s.taskDependency)
        .where(eq(s.taskDependency.dependsOnId, source.id))
    ).length,
    0,
  );
  const files = await import("../src/lib/attachments");
  await assert.rejects(files.readAttachment(fileId, admin), { status: 404 });
  await assert.rejects(
    files.reserveAttachment(admin, {
      entityType: "task",
      entityId: source.id,
      filename: "late.txt",
      contentType: "text/plain",
      size: 4,
    }),
    { status: 404 },
  );
});

test("project deletion keeps every active and archived task and removes only its own finances/files", async () => {
  const { db } = await database();
  await db.delete(s.apiRate);
  const request = {
    action: "createProject",
    name: "Delete project safely",
    color: "green",
    idempotencyKey: crypto.randomUUID(),
  };
  const project = (await executeCommand(admin, request)).project!;
  const keptProject = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Keep unrelated project",
      color: "blue",
    })
  ).project!;
  const tasks = Array.from({ length: 501 }, (_, i) => ({
    id: crypto.randomUUID(),
    title: `Preserved ${i}`,
    projectId: project.id,
    createdBy: admin.email,
    archived: i % 2 === 0,
  }));
  await db.insert(s.task).values(tasks);
  const fileId = crypto.randomUUID(),
    taskFileId = crypto.randomUUID();
  await db.insert(s.attachment).values([
    {
      id: fileId,
      entityType: "project",
      entityId: project.id,
      ownerEmail: admin.email,
      filename: "project.txt",
      contentType: "text/plain",
      size: 4,
      storagePath: `evolve-files/${fileId}/txt`,
      state: "pending",
    },
    {
      id: taskFileId,
      entityType: "task",
      entityId: tasks[0].id,
      ownerEmail: admin.email,
      filename: "task.txt",
      contentType: "text/plain",
      size: 4,
      storagePath: `evolve-files/${taskFileId}/txt`,
      state: "ready",
    },
  ]);
  await seedHistoricalExpense({
    action: "addExpense",
    projectId: project.id,
    amount: "150.00",
    currency: "USD",
    description: "Removed with project",
    category: "other",
    bookedOn: "2026-10-18",
    payee: "",
    idempotencyKey: crypto.randomUUID(),
  });
  await seedHistoricalExpense({
    action: "addExpense",
    projectId: keptProject.id,
    amount: "250.00",
    currency: "IDR",
    description: "Keep this ledger",
    category: "other",
    bookedOn: "2026-10-18",
    payee: "",
    idempotencyKey: crypto.randomUUID(),
  });
  const cmd = {
    action: "deleteProject",
    id: project.id,
    version: project.version!,
    idempotencyKey: crypto.randomUUID(),
  };
  await assert.rejects(executeCommand(teammate, cmd), { status: 403 });
  await assert.rejects(
    executeCommand(admin, { ...cmd, version: project.version! + 1 }),
    { status: 409 },
  );
  assert.equal(
    (await db.select().from(s.task).where(eq(s.task.projectId, project.id)))
      .length,
    501,
  );
  const deleted = await executeCommand(admin, cmd);
  assert.equal(deleted.deletedProjectId, project.id);
  assert.deepEqual(await executeCommand(admin, cmd), deleted);
  await assert.rejects(executeCommand(admin, request), { status: 409 });
  assert.equal(
    (await db.select().from(s.project).where(eq(s.project.id, project.id)))
      .length,
    0,
  );
  assert.equal(
    (await db.select().from(s.project).where(eq(s.project.id, keptProject.id)))
      .length,
    1,
  );
  const kept = await db
    .select()
    .from(s.task)
    .where(
      sql`${s.task.id} IN (${sql.join(
        tasks.map((task) => sql`${task.id}`),
        sql`,`,
      )})`,
    );
  assert.equal(kept.length, 501);
  assert.ok(
    kept.every((task) => task.projectId === null && task.version === 2),
  );
  assert.equal(kept.filter((task) => task.archived).length, 251);
  assert.equal(
    (
      await db
        .select()
        .from(s.projectExpense)
        .where(eq(s.projectExpense.projectId, project.id))
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(s.projectExpense)
        .where(eq(s.projectExpense.projectId, keptProject.id))
    ).length,
    1,
  );
  assert.equal(
    (await db.select().from(s.attachment).where(eq(s.attachment.id, fileId)))[0]
      .state,
    "deleting",
  );
  assert.equal(
    (
      await db
        .select()
        .from(s.attachment)
        .where(eq(s.attachment.id, taskFileId))
    )[0].state,
    "ready",
  );
  assert.equal(
    (
      await db
        .select()
        .from(s.activity)
        .where(eq(s.activity.projectId, project.id))
    ).length,
    0,
  );
  assert.ok(
    (await db.select().from(s.activity)).some((item) =>
      item.message.includes("Delete project safely"),
    ),
  );
  const files = await import("../src/lib/attachments");
  await assert.rejects(files.ownedReservation(admin, fileId), { status: 404 });
  await assert.rejects(
    files.reserveAttachment(admin, {
      entityType: "project",
      entityId: project.id,
      filename: "late.txt",
      contentType: "text/plain",
      size: 4,
    }),
    { status: 404 },
  );
});

test(
  "reassigning and deleting a task during Calendar sync still removes its in-flight event",
  { timeout: 30000 },
  async (t) => {
    const { db } = await database();
    await db.delete(s.apiRate);
    const google = await import("../src/lib/calendar/google");
    const worker = await import("../src/lib/calendar/jobs");
    const previousFetch = globalThis.fetch,
      previousSecret = process.env.BETTER_AUTH_SECRET,
      previousOrigin = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://evolve.example";
    process.env.BETTER_AUTH_SECRET =
      "deletion-tests-only-secret-long-enough-for-encryption";
    t.after(async () => {
      globalThis.fetch = previousFetch;
      if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = previousSecret;
      if (previousOrigin === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousOrigin;
      await db
        .delete(s.calendarJob)
        .where(eq(s.calendarJob.email, admin.email));
      await db
        .delete(s.calendarEvent)
        .where(eq(s.calendarEvent.email, admin.email));
      await db
        .delete(s.calendarConnection)
        .where(eq(s.calendarConnection.email, admin.email));
    });
    const create = {
      action: "createTask",
      task: {
        title: "Delete while syncing",
        dueDate: "2026-12-10",
        assignee: admin.email,
      },
      idempotencyKey: crypto.randomUUID(),
    };
    const task = (await executeCommand(admin, create)).task!;
    const member = (
      await db.select().from(s.member).where(eq(s.member.email, admin.email))
    )[0];
    await db.insert(s.calendarConnection).values({
      email: admin.email,
      accessToken: google.encryptCalendarToken(
        "local-mock-access",
        admin.email,
      ),
      refreshToken: google.encryptCalendarToken(
        "local-mock-refresh",
        admin.email,
      ),
      expiresAt: new Date(Date.now() + 3600000),
      calendarId: "local-deletion-test",
      timeZone: member.timeZone,
      syncScope: "assigned",
    });
    const hash = crypto.randomUUID();
    await db.insert(s.calendarOauthState).values({
      hash,
      email: admin.email,
      returnTaskId: task.id,
      verifier: "local-unused-test",
      expiresAt: new Date(Date.now() + 600000),
    });
    await db.insert(s.notification).values({
      id: crypto.randomUUID(),
      email: admin.email,
      taskId: task.id,
      message: "Deleted task notification",
    });
    await db
      .insert(s.calendarJob)
      .values({ email: admin.email, taskId: task.id });
    let release!: () => void,
      entered!: () => void,
      failRemoval = true;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input),
        method = init?.method || "GET";
      calls.push({ url, method });
      if (method === "PUT") {
        entered();
        await gate;
        return Response.json({
          id: google.googleEventId(admin.email, task.id),
        });
      }
      if (method === "DELETE" && failRemoval)
        return Response.json({ error: "unavailable" }, { status: 503 });
      return new Response(null, { status: 404 });
    };
    const inFlight = worker.processCalendarJobs(1, {
      email: admin.email,
      taskId: task.id,
    });
    try {
      await Promise.race([
        started,
        inFlight.then(() => {
          throw new Error(
            "Calendar worker stopped before the mocked in-flight write.",
          );
        }),
      ]);
      const reassigned = (
        await executeCommand(admin, {
          action: "updateTask",
          id: task.id,
          version: task.version,
          patch: { assignee: null },
        })
      ).task!;
      await executeCommand(admin, {
        action: "deleteTask",
        id: task.id,
        version: reassigned.version,
        idempotencyKey: crypto.randomUUID(),
      });
    } finally {
      release();
      await inFlight;
    }
    assert.equal(await inFlight, 1);
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarEvent)
          .where(eq(s.calendarEvent.taskId, task.id))
      ).length,
      1,
    );
    assert.equal(
      await worker.processCalendarJobs(1, {
        email: admin.email,
        taskId: task.id,
      }),
      0,
    );
    const pending = (
      await db
        .select()
        .from(s.calendarJob)
        .where(eq(s.calendarJob.taskId, task.id))
    )[0];
    assert.ok(
      pending,
      "Deletion must retain cleanup after an out-of-scope in-flight write.",
    );
    assert.ok(pending.generation > 1);
    assert.equal(pending.attempts, 1);
    failRemoval = false;
    await db
      .update(s.calendarJob)
      .set({ availableAt: new Date(0) })
      .where(eq(s.calendarJob.taskId, task.id));
    assert.equal(
      await worker.processCalendarJobs(1, {
        email: admin.email,
        taskId: task.id,
      }),
      1,
    );
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarEvent)
          .where(eq(s.calendarEvent.taskId, task.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarJob)
          .where(eq(s.calendarJob.taskId, task.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarTaskPreference)
          .where(eq(s.calendarTaskPreference.taskId, task.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(s.notification)
          .where(eq(s.notification.taskId, task.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarOauthState)
          .where(eq(s.calendarOauthState.hash, hash))
      )[0].returnTaskId,
      null,
    );
    await assert.rejects(executeCommand(admin, create), { status: 409 });
    assert.ok(
      calls.some(
        (call) =>
          call.method === "DELETE" &&
          call.url.includes(google.googleEventId(admin.email, task.id)),
      ),
    );
  },
);

test("an attachment reservation racing task deletion cannot leave a live orphan", async () => {
  const { db } = await database();
  await db.delete(s.apiRate);
  const files = await import("../src/lib/attachments");
  const task = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Concurrent reservation deletion" },
    })
  ).task!;
  const [removed, reserved] = await Promise.allSettled([
    executeCommand(admin, {
      action: "deleteTask",
      id: task.id,
      version: task.version,
      idempotencyKey: crypto.randomUUID(),
    }),
    files.reserveAttachment(admin, {
      entityType: "task",
      entityId: task.id,
      filename: "race.txt",
      contentType: "text/plain",
      size: 4,
    }),
  ]);
  assert.equal(removed.status, "fulfilled");
  if (reserved.status === "fulfilled") {
    const item = (
      await db
        .select()
        .from(s.attachment)
        .where(eq(s.attachment.id, reserved.value.id))
    )[0];
    assert.equal(item.state, "deleting");
    await assert.rejects(files.ownedReservation(admin, item.id), {
      status: 404,
    });
  } else assert.equal(reserved.reason.status, 404);
  const remaining = await db
    .select()
    .from(s.attachment)
    .where(eq(s.attachment.entityId, task.id));
  assert.ok(remaining.every((item) => item.state === "deleting"));
});

for (const scenario of ["reconnect", "callback"] as const) {
  test(
    `Calendar recovers when a task is deleted during ${scenario}`,
    { timeout: 30000 },
    async (t) => {
      const { db } = await database();
      await db.delete(s.apiRate);
      const calendar = await import("../src/lib/calendar/service");
      const google = await import("../src/lib/calendar/google");
      const worker = await import("../src/lib/calendar/jobs");
      const previousFetch = globalThis.fetch;
      const settings = {
        BETTER_AUTH_URL: "https://evolve.example",
        BETTER_AUTH_SECRET:
          "calendar-recovery-tests-only-encryption-secret-long-enough",
        GOOGLE_CLIENT_ID: "calendar-recovery-tests-only",
        GOOGLE_CLIENT_SECRET: "calendar-recovery-tests-only",
      };
      const previous = new Map(
        Object.keys(settings).map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, settings);
      t.after(async () => {
        globalThis.fetch = previousFetch;
        for (const [key, value] of previous) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await db
          .delete(s.calendarJob)
          .where(eq(s.calendarJob.email, admin.email));
        await db
          .delete(s.calendarEvent)
          .where(eq(s.calendarEvent.email, admin.email));
        await db
          .delete(s.calendarConnection)
          .where(eq(s.calendarConnection.email, admin.email));
      });
      const task = (
        await executeCommand(admin, {
          action: "createTask",
          task: {
            title: `Calendar deletion ${scenario}`,
            assignee: admin.email,
            dueDate: "2026-12-10",
          },
        })
      ).task!;
      const member = (
        await db.select().from(s.member).where(eq(s.member.email, admin.email))
      )[0];
      if (scenario === "reconnect") {
        await db.insert(s.calendarConnection).values({
          email: admin.email,
          accessToken: google.encryptCalendarToken("mock-access", admin.email),
          refreshToken: google.encryptCalendarToken(
            "mock-refresh",
            admin.email,
          ),
          expiresAt: new Date(Date.now() + 3600000),
          calendarId: "retained-calendar",
          timeZone: member.timeZone,
          syncScope: "assigned",
        });
        await db.insert(s.calendarEvent).values({
          email: admin.email,
          taskId: task.id,
          eventId: google.googleEventId(admin.email, task.id),
          syncedVersion: task.version,
        });
        await calendar.disconnectCalendar(admin);
        await executeCommand(admin, {
          action: "deleteTask",
          id: task.id,
          version: task.version,
          idempotencyKey: crypto.randomUUID(),
        });
        assert.equal(
          (
            await db
              .select()
              .from(s.calendarEvent)
              .where(eq(s.calendarEvent.taskId, task.id))
          ).length,
          1,
        );
      }
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/token")) {
          if (scenario === "callback") {
            entered();
            await gate;
          }
          return Response.json({
            access_token: "new-mock-access",
            refresh_token: "new-mock-refresh",
            expires_in: 3600,
            scope: google.CALENDAR_SCOPE,
          });
        }
        if (url.includes("/userinfo"))
          return Response.json({ email: admin.email, email_verified: true });
        if (url.includes("/events/") && init?.method === "DELETE")
          return new Response(null, { status: 204 });
        return Response.json({
          id: "retained-calendar",
          timeZone: member.timeZone,
        });
      };
      const attempt = await calendar.startCalendarConnection(
        admin,
        scenario === "callback" ? task.id : undefined,
      );
      const completion = calendar
        .finishCalendarConnection(
          admin,
          attempt.state,
          attempt.state,
          "local-mock-code",
        )
        .then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        );
      if (scenario === "callback") {
        try {
          await Promise.race([
            started,
            completion.then(() => {
              throw new Error(
                "Callback stopped before its mocked token exchange.",
              );
            }),
          ]);
          await executeCommand(admin, {
            action: "deleteTask",
            id: task.id,
            version: task.version,
            idempotencyKey: crypto.randomUUID(),
          });
        } finally {
          release();
        }
      }
      const result = await completion;
      assert.equal(
        result.ok,
        true,
        "Connecting Calendar must succeed even when its return task disappeared.",
      );
      assert.equal(result.value, null);
      assert.equal((await calendar.calendarStatus(admin)).connected, true);
      if (scenario === "reconnect") {
        const jobs = await db
          .select()
          .from(s.calendarJob)
          .where(eq(s.calendarJob.taskId, task.id));
        assert.equal(
          jobs.length,
          1,
          "Reconnect must enqueue retained events whose tasks were deleted.",
        );
        assert.equal(
          await worker.processCalendarJobs(1, {
            email: admin.email,
            taskId: task.id,
          }),
          1,
        );
        assert.equal(
          (
            await db
              .select()
              .from(s.calendarEvent)
              .where(eq(s.calendarEvent.taskId, task.id))
          ).length,
          0,
        );
      }
      assert.equal(
        (
          await db
            .select()
            .from(s.calendarTaskPreference)
            .where(eq(s.calendarTaskPreference.taskId, task.id))
        ).length,
        0,
      );
    },
  );
}

test(
  "scope changes retain first-write recovery when a task is deleted after sync finishes",
  { timeout: 30000 },
  async (t) => {
    const { db } = await database();
    await db.delete(s.apiRate);
    const calendar = await import("../src/lib/calendar/service");
    const google = await import("../src/lib/calendar/google");
    const worker = await import("../src/lib/calendar/jobs");
    const previousFetch = globalThis.fetch;
    const settings = {
      BETTER_AUTH_URL: "https://evolve.example",
      BETTER_AUTH_SECRET:
        "calendar-scope-tests-only-encryption-secret-long-enough",
    };
    const previous = new Map(
      Object.keys(settings).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, settings);
    t.after(async () => {
      globalThis.fetch = previousFetch;
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await db
        .delete(s.calendarJob)
        .where(eq(s.calendarJob.email, admin.email));
      await db
        .delete(s.calendarEvent)
        .where(eq(s.calendarEvent.email, admin.email));
      await db
        .delete(s.calendarConnection)
        .where(eq(s.calendarConnection.email, admin.email));
    });
    const task = (
      await executeCommand(admin, {
        action: "createTask",
        task: {
          title: "Delete after first write changes scope",
          dueDate: "2026-12-10",
          assignee: null,
        },
      })
    ).task!;
    const [member] = await db
      .select()
      .from(s.member)
      .where(eq(s.member.email, admin.email));
    await db.insert(s.calendarConnection).values({
      email: admin.email,
      accessToken: google.encryptCalendarToken("mock-access", admin.email),
      refreshToken: google.encryptCalendarToken("mock-refresh", admin.email),
      expiresAt: new Date(Date.now() + 3600000),
      calendarId: "scope-test-calendar",
      timeZone: member.timeZone,
      syncScope: "all",
    });
    await db
      .insert(s.calendarJob)
      .values({ email: admin.email, taskId: task.id });
    let release!: () => void,
      entered!: () => void,
      deleted = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    globalThis.fetch = async (input, init) => {
      const url = String(input),
        method = init?.method || "GET";
      if (url.includes("/events/") && method === "PUT") {
        entered();
        await gate;
        return Response.json({
          id: google.googleEventId(admin.email, task.id),
        });
      }
      if (
        url.includes(google.googleEventId(admin.email, task.id)) &&
        method === "DELETE"
      ) {
        deleted++;
        return new Response(null, { status: 204 });
      }
      throw new Error("Unexpected Google request in scope recovery test.");
    };
    const inFlight = worker.processCalendarJobs(1, {
      email: admin.email,
      taskId: task.id,
    });
    try {
      await Promise.race([
        started,
        inFlight.then(() => {
          throw new Error("Worker ended before the mocked first write.");
        }),
      ]);
      await calendar.updateCalendarSettings(admin, {
        version: 1,
        syncScope: "assigned",
        reminders: [30],
      });
    } finally {
      release();
      await inFlight;
    }
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarEvent)
          .where(eq(s.calendarEvent.taskId, task.id))
      ).length,
      0,
    );
    // Delete only after the stale worker has finished and lost its ledger write.
    await executeCommand(admin, {
      action: "deleteTask",
      id: task.id,
      version: task.version,
      idempotencyKey: crypto.randomUUID(),
    });
    assert.equal(
      await worker.processCalendarJobs(1, {
        email: admin.email,
        taskId: task.id,
      }),
      1,
      "Changing scope must preserve recovery beyond the first worker's completion.",
    );
    assert.equal(deleted, 1);
    assert.equal(
      (
        await db
          .select()
          .from(s.calendarJob)
          .where(eq(s.calendarJob.taskId, task.id))
      ).length,
      0,
    );
  },
);

for (const pause of ["disconnect", "revocation"] as const) {
  test(
    `first Calendar write remains recoverable across ${pause} and task deletion`,
    { timeout: 30000 },
    async (t) => {
      const { db } = await database();
      await db.delete(s.apiRate);
      const calendar = await import("../src/lib/calendar/service");
      const google = await import("../src/lib/calendar/google");
      const worker = await import("../src/lib/calendar/jobs");
      const actor = {
        email: `calendar-${pause}@example.com`,
        name: "Calendar recovery member",
        isAdmin: false,
      };
      await executeCommand(admin, {
        action: "inviteMember",
        email: actor.email,
        name: actor.name,
      });
      const previousFetch = globalThis.fetch;
      const settings = {
        BETTER_AUTH_URL: "https://evolve.example",
        BETTER_AUTH_SECRET:
          "calendar-paused-write-tests-only-encryption-secret-long-enough",
        GOOGLE_CLIENT_ID: "calendar-tests-only",
        GOOGLE_CLIENT_SECRET: "calendar-tests-only",
      };
      const previous = new Map(
        Object.keys(settings).map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, settings);
      t.after(async () => {
        globalThis.fetch = previousFetch;
        for (const [key, value] of previous) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await db
          .delete(s.calendarJob)
          .where(eq(s.calendarJob.email, actor.email));
        await db
          .delete(s.calendarEvent)
          .where(eq(s.calendarEvent.email, actor.email));
        await db
          .delete(s.calendarConnection)
          .where(eq(s.calendarConnection.email, actor.email));
      });
      const task = (
        await executeCommand(admin, {
          action: "createTask",
          task: {
            title: `First write during ${pause}`,
            assignee: actor.email,
            dueDate: "2026-12-10",
          },
        })
      ).task!;
      const member = (
        await db.select().from(s.member).where(eq(s.member.email, actor.email))
      )[0];
      await db.insert(s.calendarConnection).values({
        email: actor.email,
        accessToken: google.encryptCalendarToken("mock-access", actor.email),
        refreshToken: google.encryptCalendarToken("mock-refresh", actor.email),
        expiresAt: new Date(Date.now() + 3600000),
        calendarId: "same-calendar",
        timeZone: member.timeZone,
        syncScope: "assigned",
      });
      await db
        .insert(s.calendarJob)
        .values({ email: actor.email, taskId: task.id });
      let release!: () => void,
        entered!: () => void,
        deleted = 0;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      globalThis.fetch = async (input, init) => {
        const url = String(input),
          method = init?.method || "GET";
        if (url.includes("/events/") && method === "PUT") {
          entered();
          await gate;
          return Response.json({
            id: google.googleEventId(actor.email, task.id),
          });
        }
        if (url.includes("/events/") && method === "DELETE") {
          deleted++;
          return new Response(null, { status: 204 });
        }
        if (url.endsWith("/token"))
          return Response.json({
            access_token: "new-mock-access",
            refresh_token: "new-mock-refresh",
            expires_in: 3600,
            scope: google.CALENDAR_SCOPE,
          });
        if (url.includes("/userinfo"))
          return Response.json({ email: actor.email, email_verified: true });
        return Response.json({
          id: "same-calendar",
          timeZone: member.timeZone,
        });
      };
      const inFlight = worker.processCalendarJobs(1, {
        email: actor.email,
        taskId: task.id,
      });
      try {
        await Promise.race([
          started,
          inFlight.then(() => {
            throw new Error(
              "Worker ended before the first mocked provider write.",
            );
          }),
        ]);
        if (pause === "disconnect") await calendar.disconnectCalendar(actor);
        else
          await executeCommand(admin, {
            action: "setMemberAccess",
            email: actor.email,
            disabled: true,
          });
      } finally {
        release();
        await inFlight;
      }
      const disconnected = (
        await db
          .select()
          .from(s.calendarConnection)
          .where(eq(s.calendarConnection.email, actor.email))
      )[0];
      assert.equal(disconnected.accessToken, "");
      assert.equal(disconnected.refreshToken, "");
      assert.equal((await calendar.calendarStatus(actor)).pending, 0);
      assert.equal(
        (
          await db
            .select()
            .from(s.calendarEvent)
            .where(eq(s.calendarEvent.taskId, task.id))
        ).length,
        0,
      );
      await executeCommand(admin, {
        action: "deleteTask",
        id: task.id,
        version: task.version,
        idempotencyKey: crypto.randomUUID(),
      });
      assert.equal(
        await worker.processCalendarJobs(1, {
          email: actor.email,
          taskId: task.id,
        }),
        0,
      );
      assert.equal(
        deleted,
        0,
        "No provider deletion occurs while access is paused.",
      );
      if (pause === "revocation")
        await executeCommand(admin, {
          action: "setMemberAccess",
          email: actor.email,
          disabled: false,
        });
      const attempt = await calendar.startCalendarConnection(actor);
      await calendar.finishCalendarConnection(
        actor,
        attempt.state,
        attempt.state,
        "mock-code",
      );
      assert.equal(
        await worker.processCalendarJobs(1, {
          email: actor.email,
          taskId: task.id,
        }),
        1,
        "Reconnect must recover the first write even when no event was recorded.",
      );
      assert.equal(deleted, 1);
      assert.equal(
        (
          await db
            .select()
            .from(s.calendarJob)
            .where(eq(s.calendarJob.taskId, task.id))
        ).length,
        0,
      );
    },
  );
}

test("task labels follow current project across edits, moves and archive without rewriting legacy rows", async () => {
  const { db } = await database();
  const { findTask, queryTasks, workspaceStatistics } =
    await import("../src/lib/task-query");
  const { connectionEntity } = await import("../src/lib/connections");
  const { projectSummaries } = await import("../src/lib/project-data");
  const first = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Inheritance first",
      labels: ["#First Label"],
    })
  ).project!;
  const second = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Inheritance second",
      labels: ["#Second Label"],
    })
  ).project!;
  let child = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Inheritance fixture",
        projectId: first.id,
        assignee: admin.email,
      },
    })
  ).task!;
  assert.deepEqual(child.labels, ["first_label"]);
  await db
    .update(s.task)
    .set({ labels: ["retired_secret_tag"] })
    .where(eq(s.task.id, child.id));
  await db
    .update(s.project)
    .set({ labels: [" ＃ＦＩＲＳＴ  Label ", "first_label"] })
    .where(eq(s.project.id, first.id));
  assert.deepEqual((await projectSummaries(db, first.id))[0].labels, [
    "first_label",
  ]);
  assert.deepEqual((await findTask(child.id)).labels, ["first_label"]);
  assert.deepEqual((await connectionEntity(admin, "task", child.id)).labels, [
    "first_label",
  ]);
  const workspace = await loadWorkspace(admin);
  for (const item of workspace.tasks)
    assert.deepEqual(
      item.labels,
      workspace.projects.find((project) => project.id === item.projectId)
        ?.labels || [],
    );
  const statistics = await workspaceStatistics(admin, "UTC");
  for (const item of statistics.focus)
    assert.deepEqual(
      item.labels,
      workspace.projects.find((project) => project.id === item.projectId)
        ?.labels || [],
    );
  assert.equal(
    (
      await queryTasks(admin, new URLSearchParams({ q: "#First Label" }))
    ).tasks.some((item) => item.id === child.id),
    true,
  );
  assert.equal(
    (await queryTasks(admin, new URLSearchParams({ q: "retired_secret_tag" })))
      .total,
    0,
  );
  const retired = connectionCatalogSchema.parse(
    await queryConnections(
      admin,
      new URLSearchParams({ q: "retired_secret_tag" }),
    ),
  );
  assert.equal(retired.total, 0);
  const updated = (
    await executeCommand(admin, {
      action: "updateConnectionLabels",
      kind: "project",
      id: first.id,
      version: first.version,
      labels: ["#Revised Label"],
    })
  ).project!;
  assert.deepEqual((await findTask(child.id)).labels, updated.labels);
  child = (
    await executeCommand(admin, {
      action: "updateTask",
      id: child.id,
      version: child.version,
      patch: { projectId: second.id, archived: true },
    })
  ).task!;
  assert.deepEqual(child.labels, ["second_label"]);
  assert.deepEqual(
    (
      await queryTasks(
        admin,
        new URLSearchParams({ archived: "true", q: "second_label" }),
      )
    ).tasks.find((item) => item.id === child.id)?.labels,
    ["second_label"],
  );
  const archived = connectionItemsSchema.parse(
    await queryConnections(
      admin,
      new URLSearchParams({
        mode: "items",
        label: "second_label",
        includeArchived: "true",
      }),
    ),
  );
  assert.ok(archived.items.some((item) => item.id === child.id));
  child = (
    await executeCommand(admin, {
      action: "updateTask",
      id: child.id,
      version: child.version,
      patch: { projectId: null },
    })
  ).task!;
  assert.deepEqual(child.labels, []);
  const [raw] = await db.select().from(s.task).where(eq(s.task.id, child.id));
  assert.deepEqual(raw.labels, ["retired_secret_tag"]);
});

test("recurrence inherits project labels without copying retired task labels", async () => {
  const { db } = await database();
  const project = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Recurring tag owner",
      labels: ["#Recurring Label"],
    })
  ).project!;
  const task = (
    await executeCommand(admin, {
      action: "createTask",
      task: {
        title: "Recurring inheritance",
        projectId: project.id,
        recurrence: "daily",
        dueDate: "2026-11-01",
      },
    })
  ).task!;
  await db
    .update(s.task)
    .set({ labels: ["retired_recurrence"] })
    .where(eq(s.task.id, task.id));
  const completed = await executeCommand(admin, {
    action: "updateTask",
    id: task.id,
    version: task.version,
    patch: { status: "done" },
  });
  const next = completed.tasks!.find((item) => item.id !== task.id)!;
  assert.deepEqual(next.labels, ["recurring_label"]);
  const [raw] = await db.select().from(s.task).where(eq(s.task.id, next.id));
  assert.deepEqual(raw.labels, []);
});

test("legacy project labels use the same Unicode canonical keys in every query", async () => {
  const { db } = await database();
  const { cleanLabel } = await import("../src/lib/labels");
  const { queryTasks } = await import("../src/lib/task-query");
  const project = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Unicode label owner",
    })
  ).project!;
  const task = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Unicode inheritance fixture", projectId: project.id },
    })
  ).task!;
  const legacy = ["İSTANBUL", "ΟΣ", " #White "];
  await db
    .update(s.project)
    .set({ labels: legacy })
    .where(eq(s.project.id, project.id));
  for (const label of legacy.map(cleanLabel)) {
    const catalog = connectionCatalogSchema.parse(
      await queryConnections(admin, new URLSearchParams({ q: label })),
    );
    assert.ok(
      catalog.groups.some(
        (group) =>
          group.key === label &&
          group.projectCount === 1 &&
          group.taskCount === 1,
      ),
      label,
    );
    const items = connectionItemsSchema.parse(
      await queryConnections(
        admin,
        new URLSearchParams({ mode: "items", label }),
      ),
    );
    assert.ok(
      items.items.some(
        (item) => item.id === task.id && item.labels.includes(label),
      ),
      label,
    );
    const matches = await queryTasks(admin, new URLSearchParams({ q: label }));
    assert.ok(
      matches.tasks.some((item) => item.id === task.id),
      label,
    );
  }
});

test("workspace continuation pages expose inherited labels and preserve raw legacy rows", async () => {
  const { db } = await database();
  const project = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Paged label owner",
      labels: ["#Paged Label"],
    })
  ).project!;
  const id = "ffffffff-ffff-4fff-bfff-fffffffffffd";
  await db.insert(s.task).values({
    id,
    title: "Paged label fixture",
    projectId: project.id,
    labels: ["retired_page_tag"],
    createdBy: admin.email,
  });
  const targeted = (await loadTaskPage(
    "ffffffff-ffff-4fff-bfff-fffffffffffc",
  )) as { tasks: Task[] };
  assert.deepEqual(targeted.tasks.find((task) => task.id === id)?.labels, [
    "paged_label",
  ]);
  const [raw] = await db.select().from(s.task).where(eq(s.task.id, id));
  assert.deepEqual(raw.labels, ["retired_page_tag"]);
});

test("receipt replay returns current project labels and task ownership after project edits and moves", async () => {
  const { db } = await database();
  const projectCommand = {
    action: "createProject",
    name: "Receipt label owner",
    labels: ["#Original Label"],
    idempotencyKey: crypto.randomUUID(),
  };
  const original = (await executeCommand(admin, projectCommand)).project!;
  const destination = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Receipt move destination",
      labels: ["#Destination Label"],
    })
  ).project!;
  const commands = [
    {
      action: "createTask",
      idempotencyKey: crypto.randomUUID(),
      task: { title: "Receipt create fixture", projectId: original.id },
    },
    {
      action: "importTasks",
      idempotencyKey: crypto.randomUUID(),
      tasks: [{ title: "Receipt import fixture", projectId: original.id }],
    },
  ];
  const tasks: Task[] = [];
  for (const command of commands) {
    const result = await executeCommand(admin, command);
    tasks.push(result.task || result.tasks![0]);
  }
  const bulkCommand = {
    action: "bulkUpdateTasks",
    idempotencyKey: crypto.randomUUID(),
    items: tasks.map(({ id, version }) => ({ id, version })),
    patch: { priority: "high" },
  };
  const bulk = await executeCommand(admin, bulkCommand);
  const currentProject = (
    await executeCommand(admin, {
      action: "updateConnectionLabels",
      kind: "project",
      id: original.id,
      version: original.version,
      labels: ["#Current Label"],
    })
  ).project!;
  const replayedProject = (await executeCommand(admin, projectCommand))
    .project!;
  assert.deepEqual(replayedProject.labels, ["current_label"]);
  assert.equal(replayedProject.version, currentProject.version);
  for (let index = 0; index < tasks.length; index++) {
    const current = bulk.tasks!.find((task) => task.id === tasks[index].id)!;
    await db
      .update(s.task)
      .set({ labels: ["retired_receipt_tag"] })
      .where(eq(s.task.id, current.id));
    const moved = (
      await executeCommand(admin, {
        action: "updateTask",
        id: current.id,
        version: current.version,
        patch: {
          projectId: index === 0 ? destination.id : null,
          archived: true,
        },
      })
    ).task!;
    const replay = await executeCommand(admin, commands[index]);
    const task = replay.task || replay.tasks![0];
    assert.equal(task.projectId, moved.projectId);
    assert.equal(task.version, moved.version);
    assert.equal(task.archived, true);
    assert.deepEqual(task.labels, moved.labels);
  }
  const replayedBulk = await executeCommand(admin, bulkCommand);
  assert.deepEqual(
    replayedBulk.tasks!.map((task) => task.labels),
    [["destination_label"], []],
  );
  const originals = await db
    .select()
    .from(s.task)
    .where(
      sql`${s.task.id} IN (${sql.join(
        tasks.map((task) => sql`${task.id}`),
        sql`,`,
      )})`,
    );
  assert.ok(
    originals.every((task) => task.labels[0] === "retired_receipt_tag"),
  );
});

test("a bare hashtag search does not match every tagged project", async () => {
  const { queryTasks } = await import("../src/lib/task-query");
  const project = (
    await executeCommand(admin, {
      action: "createProject",
      name: "Hashtag search owner",
      labels: ["#Focused Label"],
    })
  ).project!;
  const task = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Literal search fixture", projectId: project.id },
    })
  ).task!;
  const matches = await queryTasks(admin, new URLSearchParams({ q: "#" }));
  assert.equal(
    matches.tasks.some((item) => item.id === task.id),
    false,
  );
});

test("legacy project label boundaries cannot break workspace, paging, search or Connection reads", async () => {
  const { db } = await database();
  const id = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const labels = ["#", "##", "İ".repeat(30), "#Legacy Project"];
  await db
    .insert(s.project)
    .values({ id, name: "Legacy label boundary", labels });
  await db.insert(s.task).values({
    id: taskId,
    title: "Legacy label boundary task",
    createdBy: admin.email,
    projectId: id,
    labels: ["retired_private_label"],
  });
  const expected = ["i\u0307".repeat(30), "legacy_project"];
  try {
    const workspace = await loadWorkspace(admin);
    assert.deepEqual(
      workspace.projects.find((item) => item.id === id)?.labels,
      expected,
    );
    const { findTask } = await import("../src/lib/task-query");
    assert.deepEqual((await findTask(taskId))?.labels, expected);
    const { queryTasks } = await import("../src/lib/task-query");
    const tasks = await queryTasks(
      admin,
      new URLSearchParams({ q: "#Legacy Project" }),
    );
    assert.ok(tasks.tasks.some((item) => item.id === taskId));
    const catalog = await queryConnections(
      admin,
      new URLSearchParams({ mode: "catalog", q: "#Legacy Project" }),
    );
    assert.ok(
      "groups" in catalog &&
        catalog.groups.some((group) => group.key === "legacy_project"),
    );
    const items = await queryConnections(
      admin,
      new URLSearchParams({ mode: "items", label: "#Legacy Project" }),
    );
    assert.ok(
      "items" in items && items.items.some((item) => item.id === taskId),
    );
    assert.deepEqual(
      (
        await db
          .select({ labels: s.project.labels })
          .from(s.project)
          .where(eq(s.project.id, id))
      )[0].labels,
      labels,
    );
    assert.deepEqual(
      (
        await db
          .select({ labels: s.task.labels })
          .from(s.task)
          .where(eq(s.task.id, taskId))
      )[0].labels,
      ["retired_private_label"],
    );
  } finally {
    await db.delete(s.task).where(eq(s.task.id, taskId));
    await db.delete(s.project).where(eq(s.project.id, id));
  }
});

test("planned COD persists nullable years, preserves omission and labels, and enforces permissions and versions", async () => {
  const { projectFields } = await import("../src/lib/project-model");
  const { db } = await database();
  const command = {
    action: "createProject",
    idempotencyKey: crypto.randomUUID(),
    name: "COD integration",
    plannedCodYear: 2026,
    category: "Pembangkit",
    costOptions: [
      {
        id: crypto.randomUUID(),
        title: "Capital",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Supply",
            unit: "USD",
            amount: "12.34",
          },
        ],
      },
    ],
  };
  const p = (await seedHistoricalProject(command)).project!;
  assert.equal(p.plannedCodYear, 2026);
  assert.equal(
    (await db.select().from(s.project).where(eq(s.project.id, p.id)))[0]
      .plannedCodYear,
    2026,
  );
  assert.equal(
    (await loadWorkspace(admin)).projects.find((item) => item.id === p.id)
      ?.plannedCodYear,
    2026,
  );
  const { plannedCodYear: _year, ...legacyFields } = projectFields.parse(p);
  void _year;
  const update = (version: number, extra = {}) => ({
    ...legacyFields,
    action: "updateProject",
    id: p.id,
    version,
    ...extra,
  });
  for (const actor of [teammate]) {
    await assert.rejects(
      executeCommand(actor, {
        ...command,
        idempotencyKey: crypto.randomUUID(),
      }),
      { status: 403 },
    );
    await assert.rejects(
      executeCommand(actor, update(p.version!, { plannedCodYear: 2040 })),
      { status: 403 },
    );
  }
  const kept = (await executeCommand(admin, update(p.version!))).project!;
  assert.equal(kept.plannedCodYear, 2026);
  assert.deepEqual(kept.costOptions, p.costOptions);
  const labels = (
    await executeCommand(admin, {
      action: "updateConnectionLabels",
      kind: "project",
      id: p.id,
      version: kept.version!,
      labels: ["COD"],
    })
  ).project!;
  assert.equal(labels.plannedCodYear, 2026);
  assert.deepEqual(labels.costItems, p.costItems);
  await assert.rejects(
    executeCommand(admin, update(kept.version!, { plannedCodYear: 2040 })),
    { status: 409 },
  );
  const changed = (
    await executeCommand(
      admin,
      update(labels.version!, { plannedCodYear: 2040 }),
    )
  ).project!;
  assert.equal(changed.plannedCodYear, 2040);
  const replay = (await seedHistoricalProject(command)).project!;
  assert.equal(replay.id, p.id);
  assert.equal(replay.plannedCodYear, 2040);
  assert.equal(replay.version, changed.version);
  await assert.rejects(
    seedHistoricalProject({ ...command, plannedCodYear: 2027 }),
    { status: 409 },
  );
  const cleared = (
    await executeCommand(
      admin,
      update(changed.version!, { plannedCodYear: null }),
    )
  ).project!;
  assert.equal(cleared.plannedCodYear, null);
  assert.equal(
    (
      await executeCommand(admin, {
        action: "createProject",
        name: "Unset COD",
      })
    ).project!.plannedCodYear,
    null,
  );
  assert.equal(
    (
      await executeCommand(admin, {
        action: "createProject",
        name: "Null COD",
        plannedCodYear: null,
      })
    ).project!.plannedCodYear,
    null,
  );
  for (const plannedCodYear of [2025, 2041, 2026.5, "2026", true])
    await assert.rejects(
      executeCommand(admin, {
        action: "createProject",
        name: "Invalid COD",
        plannedCodYear,
      }),
    );
  for (const value of [2025, 2041, "2026.5", "invalid"])
    await assert.rejects(
      db.execute(
        sql`UPDATE project SET planned_cod_year=${value} WHERE id=${p.id}`,
      ),
    );
  assert.equal(
    (await db.select().from(s.project).where(eq(s.project.id, p.id)))[0]
      .plannedCodYear,
    null,
  );
});

test("pre-COD lost-response project drafts replay receipts without changing the saved request", async () => {
  const { projectFields, projectCostOptions } =
    await import("../src/lib/project-model");
  const { projectSubmissionFields } =
    await import("../src/lib/project-composer");
  for (const costOptions of [undefined, []]) {
    const original = projectFields.parse({
      name: "Pre-COD receipt",
      costOptions,
    });
    const idempotencyKey = crypto.randomUUID();
    const saved = (
      await executeCommand(admin, {
        ...original,
        action: "createProject",
        idempotencyKey,
      })
    ).project!;
    const retried = projectSubmissionFields(
      {
        ...original,
        costOptions: costOptions ?? projectCostOptions(original),
        plannedCodYear: null,
      },
      JSON.stringify(original),
    );
    assert.equal(retried.success, true);
    if (!retried.success) throw new Error("Expected valid legacy retry");
    assert.equal(JSON.stringify(retried.data), JSON.stringify(original));
    const replay = (
      await executeCommand(admin, {
        ...retried.data,
        action: "createProject",
        idempotencyKey,
      })
    ).project!;
    assert.equal(replay.id, saved.id);
    assert.equal(replay.plannedCodYear, null);
  }
});

test("planned COD migration leaves legacy projects and existing cost data unchanged", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "migrations/0014_project_planned_cod.sql",
    "utf8",
  );
  const { db } = await database();
  const isolated = `cod_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`CREATE SCHEMA ${isolated}`));
    await tx.execute(sql.raw(`SET LOCAL search_path TO ${isolated}`));
    await tx.execute(
      sql`CREATE TABLE project (id text PRIMARY KEY, currency text, budget numeric(14,2), cost_items jsonb, category text, cost_options jsonb)`,
    );
    const costs = [
      {
        id: crypto.randomUUID(),
        title: "Legacy",
        currency: "USD",
        amount: "12.34",
      },
    ];
    const options = [
      { id: crypto.randomUUID(), title: "Preserved", items: [] },
    ];
    await tx.execute(
      sql`INSERT INTO project VALUES ('legacy','USD',12.34,${JSON.stringify(costs)}::jsonb,'Gardu Induk',${JSON.stringify(options)}::jsonb)`,
    );
    const before = (
      await tx.execute(sql`SELECT * FROM project WHERE id='legacy'`)
    ).rows[0];
    for (const statement of source
      .split("-- statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean))
      await tx.execute(sql.raw(statement));
    assert.deepEqual(
      (await tx.execute(sql`SELECT * FROM project WHERE id='legacy'`)).rows[0],
      { ...before, planned_cod_year: null },
    );
    for (const year of [2026, 2040, null]) {
      await tx.execute(
        sql`UPDATE project SET planned_cod_year=${year} WHERE id='legacy'`,
      );
      assert.equal(
        (
          await tx.execute(
            sql`SELECT planned_cod_year FROM project WHERE id='legacy'`,
          )
        ).rows[0].planned_cod_year,
        year,
      );
    }
    await tx.execute(sql.raw(`DROP SCHEMA ${isolated} CASCADE`));
  });
});

test("project options preserve independent rates and grouping for legacy metadata edits", async () => {
  const { projectFields } = await import("../src/lib/project-model");
  const options = [
    {
      id: crypto.randomUUID(),
      title: "Capital",
      items: [
        {
          id: crypto.randomUUID(),
          title: "Supply",
          unit: "USD",
          amount: "20.00",
        },
        {
          id: crypto.randomUUID(),
          title: "Tariff",
          unit: "Rp/kWh",
          amount: "123.123456",
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Construction",
      items: [
        {
          id: crypto.randomUUID(),
          title: "Installation",
          unit: "USD",
          amount: "10.00",
        },
      ],
    },
  ];
  const p = (
    await seedHistoricalProject({
      action: "createProject",
      name: "Options integration",
      currency: "USD",
      category: "Pembangkit",
      costOptions: options,
    })
  ).project as Project;
  assert.equal(p.category, "Pembangkit");
  assert.deepEqual(p.costOptions, options);
  assert.equal(p.budget, "0.00");
  assert.deepEqual(p.costItems, []);
  const fields = projectFields.parse(p);
  const { costOptions: _options, category: _category, ...legacy } = fields;
  void _options;
  void _category;
  const metadata = (
    await executeCommand(admin, {
      ...legacy,
      action: "updateProject",
      id: p.id,
      version: p.version!,
      name: "Options metadata",
    })
  ).project as Project;
  assert.deepEqual(metadata.costOptions, options);
  assert.equal(metadata.category, "Pembangkit");
  await assert.rejects(
    executeCommand(admin, {
      ...legacy,
      action: "updateProject",
      id: p.id,
      version: metadata.version!,
      costItems: [
        {
          id: crypto.randomUUID(),
          title: "Changed legacy",
          currency: "USD",
          amount: "1.00",
        },
      ],
    }),
    { status: 410 },
  );
  const { costItems: _items, ...omitted } = legacy;
  void _items;
  await assert.rejects(
    executeCommand(admin, {
      ...omitted,
      action: "updateProject",
      id: p.id,
      version: metadata.version!,
      budget: "31.00",
    }),
    { status: 410 },
  );
  const clearCategory = (
    await executeCommand(admin, {
      ...omitted,
      action: "updateProject",
      id: p.id,
      version: metadata.version!,
      category: null,
    })
  ).project as Project;
  assert.equal(clearCategory.category, null);
  assert.deepEqual(clearCategory.costOptions, options);
  const added = await seedHistoricalExpense({
    action: "addExpense",
    idempotencyKey: crypto.randomUUID(),
    projectId: p.id,
    currency: "USD",
    amount: "5.00",
    description: "Equipment",
    category: "procurement",
    bookedOn: "2026-10-19",
  });
  assert.equal((added.project as Project).spent, "5.00");
  assert.equal((added.project as Project).budget, "0.00");
});

test("PostgreSQL rejects invalid project categories and malformed cost option JSON", async () => {
  const { db } = await database();
  const pid = crypto.randomUUID();
  await db.insert(s.project).values({ id: pid, name: "Options constraint" });
  for (const category of ["Power plant", ""])
    await assert.rejects(
      db.execute(sql`UPDATE project SET category=${category} WHERE id=${pid}`),
    );
  for (const options of [
    {},
    [{ id: crypto.randomUUID(), title: "", items: [] }],
    [
      {
        id: crypto.randomUUID(),
        title: "Rates",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Bad",
            unit: "Rp/kWh",
            amount: "0.1234567",
          },
        ],
      },
    ],
  ])
    await assert.rejects(
      db.execute(
        sql`UPDATE project SET cost_options=${JSON.stringify(options)}::jsonb WHERE id=${pid}`,
      ),
    );
});

test("project option migration preserves legacy budgets, currencies and item JSON without backfilling groups", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = (
    await Promise.all([
      readFile("migrations/0012_project_cost_options_categories.sql", "utf8"),
      readFile("migrations/0013_project_cost_title_unicode.sql", "utf8"),
    ])
  ).join("\n-- statement-breakpoint\n");
  const { db } = await database();
  const isolated = `option_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`CREATE SCHEMA ${isolated}`));
    await tx.execute(sql.raw(`SET LOCAL search_path TO ${isolated}`));
    await tx.execute(
      sql`CREATE TABLE project (id text PRIMARY KEY, currency text, budget numeric(14,2), cost_items jsonb)`,
    );
    const legacyCosts = [
      {
        id: crypto.randomUUID(),
        title: "Legacy supply",
        currency: "USD",
        amount: "12.34",
      },
    ];
    await tx.execute(
      sql`INSERT INTO project VALUES ('legacy','USD',12.34,${JSON.stringify(legacyCosts)}::jsonb)`,
    );
    for (const statement of source
      .split("-- statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean))
      await tx.execute(sql.raw(statement));
    const row = (
      await tx.execute(
        sql`SELECT currency,budget::text,cost_items,category,cost_options FROM project WHERE id='legacy'`,
      )
    ).rows[0];
    assert.deepEqual(row, {
      currency: "USD",
      budget: "12.34",
      cost_items: legacyCosts,
      category: null,
      cost_options: null,
    });
    const valid = [
      {
        id: "00000000-0000-0000-0000-000000000000",
        title: "Zero",
        items: [
          {
            id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            title: "Zero rate",
            unit: "Rp/kWh",
            amount: "0.000001",
          },
        ],
      },
    ];
    await tx.execute(
      sql`UPDATE project SET category='Gardu Induk',cost_options=${JSON.stringify(valid)}::jsonb WHERE id='legacy'`,
    );
    assert.deepEqual(
      (
        await tx.execute(
          sql`SELECT cost_options FROM project WHERE id='legacy'`,
        )
      ).rows[0].cost_options,
      valid,
    );
    await tx.execute(sql.raw(`DROP SCHEMA ${isolated} CASCADE`));
  });
});

test("project option SQL title boundaries match API trimming and Unicode length validation", async () => {
  const { projectFields } = await import("../src/lib/project-model");
  const { db } = await database();
  const option = (title: string, itemTitle = "Supply") => ({
    id: crypto.randomUUID(),
    title,
    items: [
      {
        id: crypto.randomUUID(),
        title: itemTitle,
        unit: "USD",
        amount: "1.00",
      },
    ],
  });
  const cases = [
    { name: "tab-only group", options: [option("\t\n")], valid: false },
    { name: "NBSP-only group", options: [option("\u00a0")], valid: false },
    {
      name: "Unicode whitespace-only item",
      options: [option("Equipment", "\uFEFF\u2007\u2028\t")],
      valid: false,
    },
    {
      name: "trim-normalized ASCII duplicates",
      options: [option("\tEquipment\u00a0"), option("equipment")],
      valid: false,
    },
    {
      name: "61 astral characters in group",
      options: [option("😀".repeat(61))],
      valid: true,
    },
    {
      name: "61 astral characters in item",
      options: [option("Equipment", "😀".repeat(61))],
      valid: true,
    },
    {
      name: "120 astral characters at the limit",
      options: [option("😀".repeat(120), "😀".repeat(120))],
      valid: true,
    },
    {
      name: "121 astral characters in group",
      options: [option("😀".repeat(121))],
      valid: false,
    },
    {
      name: "121 astral characters in item",
      options: [option("Equipment", "😀".repeat(121))],
      valid: false,
    },
    {
      name: "trim before length",
      options: [
        option(
          `\t\u00a0${"a".repeat(120)}\uFEFF`,
          `\u2028${"b".repeat(120)}\u2009`,
        ),
      ],
      valid: true,
    },
    {
      name: "Turkish dotted I and ASCII i remain distinct",
      options: [option("İ"), option("i")],
      valid: true,
    },
    {
      name: "Greek contextual sigma remains distinct",
      options: [option("ΟΣ"), option("Οσ")],
      valid: true,
    },
  ];
  for (const entry of cases) {
    const parsed = projectFields.safeParse({
      name: entry.name,
      costOptions: entry.options,
    });
    assert.equal(parsed.success, entry.valid, `${entry.name}: API result`);
    const result = await db.execute(
      sql`SELECT evolve_project_cost_options_valid(${JSON.stringify(entry.options)}::jsonb) AS valid`,
    );
    assert.equal(
      result.rows[0].valid,
      entry.valid,
      `${entry.name}: SQL result`,
    );
    if (!entry.valid) {
      await assert.rejects(
        db.execute(
          sql`INSERT INTO project (id,name,cost_options) VALUES (${crypto.randomUUID()},${entry.name},${JSON.stringify(entry.options)}::jsonb)`,
        ),
        `${entry.name}: CHECK rejects direct SQL`,
      );
    }
    if (parsed.success) {
      const inserted = await db
        .insert(s.project)
        .values({
          id: crypto.randomUUID(),
          name: entry.name,
          costOptions: parsed.data.costOptions,
        })
        .returning();
      assert.deepEqual(
        inserted[0].costOptions,
        parsed.data.costOptions,
        `${entry.name}: validated API payload persists`,
      );
    }
  }
});

test("large option amounts, legacy budgets and expenses round-trip PostgreSQL exactly", async () => {
  const { projectFields, costUnitTotals } =
    await import("../src/lib/project-model");
  const { projectLedger } = await import("../src/lib/project-data");
  const amount = "123456789012345678901234567890.12";
  const options = ["Alternative A", "Alternative B"].map((title) => ({
    id: crypto.randomUUID(),
    title,
    items: [
      { id: crypto.randomUUID(), title: "Supply", unit: "USD", amount },
      {
        id: crypto.randomUUID(),
        title: "Rate",
        unit: "Rp/kWh",
        amount: "987654321098765432109876543210.123456",
      },
    ],
  }));
  const created = (
    await seedHistoricalProject({
      action: "createProject",
      name: "Exact large alternatives",
      currency: "USD",
      costOptions: options,
    })
  ).project as Project;
  assert.deepEqual(created.costOptions, options);
  assert.deepEqual(created.costItems, []);
  assert.equal(created.budget, "0.00");
  const read = (await loadWorkspace(admin)).projects.find(
    (p) => p.id === created.id,
  )!;
  assert.deepEqual(read.costOptions, options);
  assert.deepEqual(
    read.costOptions!.map((option) => costUnitTotals(option.items)),
    [
      [
        { unit: "USD", amount },
        { unit: "Rp/kWh", amount: "987654321098765432109876543210.123456" },
      ],
      [
        { unit: "USD", amount },
        { unit: "Rp/kWh", amount: "987654321098765432109876543210.123456" },
      ],
    ],
  );
  const legacy = (
    await seedHistoricalProject({
      action: "createProject",
      name: "Large legacy budget",
      currency: "USD",
      budget: amount,
    })
  ).project as Project;
  assert.equal(legacy.budget, amount);
  const entry = (
    await seedHistoricalExpense({
      action: "addExpense",
      idempotencyKey: crypto.randomUUID(),
      projectId: created.id,
      currency: "USD",
      amount,
      description: "Exact large expense",
      category: "procurement",
      bookedOn: "2026-10-20",
    })
  ).expense!;
  assert.equal(entry.amount, amount);
  const ledger = await projectLedger(created.id);
  assert.equal(ledger.expenses[0].amount, amount);
  assert.equal(
    ledger.project.spentByCurrency.find(
      (v: { currency: string }) => v.currency === "USD",
    ).amount,
    amount,
  );
  assert.equal(projectFields.safeParse(read).success, true);
});

test("cost precision migration widens storage without rewriting existing costs or projections", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "migrations/0015_project_cost_precision.sql",
    "utf8",
  );
  const { db } = await database();
  const isolated = `precision_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`CREATE SCHEMA ${isolated}`));
    await tx.execute(sql.raw(`SET LOCAL search_path TO ${isolated},public`));
    await tx.execute(
      sql`CREATE TABLE project (id text PRIMARY KEY,budget numeric(14,2),cost_items jsonb,cost_options jsonb,CONSTRAINT project_cost_options_valid CHECK (evolve_project_cost_options_valid(cost_options)))`,
    );
    await tx.execute(
      sql`CREATE TABLE project_expense (id text PRIMARY KEY,amount numeric(14,2))`,
    );
    const legacy = [
      {
        id: crypto.randomUUID(),
        title: "Existing projection",
        currency: "USD",
        amount: "12.34",
      },
    ];
    const grouped = [
      {
        id: crypto.randomUUID(),
        title: "Existing alternative",
        items: [
          {
            id: crypto.randomUUID(),
            title: "Existing cost",
            unit: "USD",
            amount: "12.34",
          },
        ],
      },
    ];
    await tx.execute(
      sql`INSERT INTO project VALUES ('existing',12.34,${JSON.stringify(legacy)}::jsonb,${JSON.stringify(grouped)}::jsonb)`,
    );
    await tx.execute(
      sql`INSERT INTO project_expense VALUES ('existing',12.34)`,
    );
    const before = (
      await tx.execute(
        sql`SELECT *,xmin::text AS row_version FROM project WHERE id='existing'`,
      )
    ).rows[0];
    const beforeExpense = (
      await tx.execute(
        sql`SELECT *,xmin::text AS row_version FROM project_expense WHERE id='existing'`,
      )
    ).rows[0];
    for (const statement of source
      .split("-- statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean))
      await tx.execute(sql.raw(statement));
    assert.deepEqual(
      (
        await tx.execute(
          sql`SELECT *,xmin::text AS row_version FROM project WHERE id='existing'`,
        )
      ).rows[0],
      before,
    );
    assert.deepEqual(
      (
        await tx.execute(
          sql`SELECT *,xmin::text AS row_version FROM project_expense WHERE id='existing'`,
        )
      ).rows[0],
      beforeExpense,
    );
    const large = "123456789012345678901234567890.12";
    await tx.execute(
      sql`UPDATE project SET budget=${large}::numeric WHERE id='existing'`,
    );
    await tx.execute(
      sql`UPDATE project_expense SET amount=${large}::numeric WHERE id='existing'`,
    );
    assert.equal(
      (
        await tx.execute(
          sql`SELECT budget::text AS amount FROM project WHERE id='existing'`,
        )
      ).rows[0].amount,
      large,
    );
    assert.equal(
      (
        await tx.execute(
          sql`SELECT amount::text AS amount FROM project_expense WHERE id='existing'`,
        )
      ).rows[0].amount,
      large,
    );
    const maximum = "9".repeat(131072);
    const options = [
      {
        ...grouped[0],
        items: [
          { ...grouped[0].items[0], amount: `${maximum}.99` },
          { ...grouped[0].items[0], id: crypto.randomUUID(), amount: "0.01" },
        ],
      },
    ];
    assert.equal(
      (
        await tx.execute(
          sql`SELECT evolve_project_cost_options_valid(${JSON.stringify(options)}::jsonb) AS valid`,
        )
      ).rows[0].valid,
      true,
      "derived option carry needs no numeric cast",
    );
    options[0].items[0].amount = `${maximum}9.99`;
    assert.equal(
      (
        await tx.execute(
          sql`SELECT evolve_project_cost_options_valid(${JSON.stringify(options)}::jsonb) AS valid`,
        )
      ).rows[0].valid,
      false,
    );
    await tx.execute(sql.raw(`DROP SCHEMA ${isolated} CASCADE`));
  });
});

test("health requires the cost precision migration before reporting a current schema", async () => {
  const { GET } = await import("../src/app/api/health/route");
  const { db } = await database();
  const migration = (
    await db.execute(
      sql`SELECT name,hash,applied_at::text AS applied_at FROM evolve_migration WHERE name='0015_project_cost_precision.sql'`,
    )
  ).rows[0];
  assert.ok(migration, "the test database must have cost precision applied");
  try {
    await db.execute(
      sql`DELETE FROM evolve_migration WHERE name='0015_project_cost_precision.sql'`,
    );
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" });
  } finally {
    await db.execute(
      sql`INSERT INTO evolve_migration (name,hash,applied_at) VALUES (${migration.name},${migration.hash},${migration.applied_at}::timestamptz)`,
    );
  }
  const restored = (
    await db.execute(
      sql`SELECT name,hash,applied_at::text AS applied_at FROM evolve_migration WHERE name='0015_project_cost_precision.sql'`,
    )
  ).rows[0];
  assert.deepEqual(
    restored,
    migration,
    "restore the exact migration ledger row",
  );
  const healthy = await GET();
  const body = await healthy.json();
  assert.equal(body.schema, "current");
  assert.equal(["ready", "configuration_required"].includes(body.status), true);
});

test("Overview snapshots and open/date/priority drilldowns agree across the database", async () => {
  const { dashboardReport } = await import("../src/lib/workspace-reports");
  const { queryTasks } = await import("../src/lib/task-query");
  const { db } = await database();
  const today = (await dashboardReport(admin, 7)).today;
  const projectId = crypto.randomUUID(),
    emptyId = crypto.randomUUID();
  const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
  await db.insert(s.project).values([
    { id: projectId, name: "Overview report fixture", color: "green" },
    { id: emptyId, name: "Overview empty fixture", color: "green" },
  ]);
  try {
    await db.insert(s.task).values(
      ids.map((id, i) => ({
        id,
        title: `Overview scope ${i}`,
        projectId,
        createdBy: admin.email,
        status: i === 4 ? ("done" as const) : ("todo" as const),
        archived: i === 5,
        priority: "urgent" as const,
        dueDate:
          i === 0
            ? "2000-01-01"
            : i === 1
              ? today
              : i === 2
                ? "2099-01-01"
                : null,
      })),
    );
    const report = await dashboardReport(admin, 7);
    assert.equal(
      Object.values(report.deadlineBuckets).reduce((sum, n) => sum + n, 0),
      report.totals.open,
    );
    const open = await queryTasks(admin, new URLSearchParams({ open: "true" }));
    assert.equal(open.total, report.totals.open);
    for (const [bucket, count] of Object.entries(report.deadlineBuckets)) {
      const result = await queryTasks(
        admin,
        new URLSearchParams({ dueBucket: bucket }),
      );
      assert.equal(
        result.total,
        count,
        `${bucket} chart matches its drilldown`,
      );
    }
    const urgent = await queryTasks(
      admin,
      new URLSearchParams({ open: "true", priority: "urgent" }),
    );
    assert.equal(urgent.total, report.priorities.urgent);
    const fixture = report.projectProgress.find((p) => p.id === projectId)!;
    assert.equal(fixture.total, 5);
    assert.equal(fixture.completed, 1);
    assert.equal(
      report.projectProgress.find((p) => p.id === emptyId)!.total,
      0,
    );
    const narrow = await queryTasks(
      admin,
      new URLSearchParams({
        open: "true",
        dueBucket: "today",
        projectId,
        limit: "1",
      }),
    );
    assert.equal(narrow.total, 1);
    assert.equal(narrow.tasks[0].id, ids[1]);
    const legacyUpcoming = await queryTasks(
      admin,
      new URLSearchParams({ dueBucket: "upcoming", projectId }),
    );
    assert.equal(
      legacyUpcoming.total,
      2,
      "legacy upcoming still includes today",
    );
  } finally {
    for (const id of ids) await db.delete(s.task).where(eq(s.task.id, id));
    await db.delete(s.project).where(eq(s.project.id, projectId));
    await db.delete(s.project).where(eq(s.project.id, emptyId));
  }
});

// Seeds retained pre-retirement records only in the disposable integration database.
async function seedHistoricalExpense(input: Record<string, unknown>) {
  const { expenseFields } = await import("../src/lib/project-model");
  const { projectLedger } = await import("../src/lib/project-data");
  const fields = expenseFields.parse(input);
  const { db } = await database();
  const [expense] = await db
    .insert(s.projectExpense)
    .values({ ...fields, id: crypto.randomUUID(), createdBy: admin.email })
    .returning();
  return { expense, project: (await projectLedger(fields.projectId)).project };
}

test("task ranges persist and enforce merged updates, atomic batches, overlap queries and SQL constraints", async () => {
  const { queryTasks } = await import("../src/lib/task-query");
  const { db } = await database();
  await db.delete(s.apiRate);
  const projectId = crypto.randomUUID();
  await db
    .insert(s.project)
    .values({ id: projectId, name: "Task range integration" });
  const legacy = (
    await executeCommand(admin, {
      action: "createTask",
      task: { title: "Legacy due-only task", projectId, dueDate: "2026-11-10" },
      idempotencyKey: crypto.randomUUID(),
    })
  ).task!;
  const input = {
    action: "createTask",
    task: {
      title: "Spanning scheduled task",
      projectId,
      startDate: "2026-10-23",
      dueDate: "2026-11-10",
      recurrence: "monthly",
    },
    idempotencyKey: crypto.randomUUID(),
  };
  const range = (await executeCommand(admin, input)).task!;
  assert.equal(range.startDate, "2026-10-23");
  assert.equal((await executeCommand(admin, input)).task!.id, range.id);
  const params = { projectId, from: "2026-10-26", to: "2026-11-01" };
  assert.equal(
    (await queryTasks(admin, new URLSearchParams(params))).total,
    0,
    "legacy date window still filters deadlines",
  );
  const overlap = await queryTasks(
    admin,
    new URLSearchParams({ ...params, dateMode: "overlap", limit: "1" }),
  );
  assert.equal(overlap.total, 1);
  assert.equal(overlap.tasks[0].id, range.id);
  await assert.rejects(
    executeCommand(admin, {
      action: "updateTask",
      id: range.id,
      version: range.version,
      patch: { dueDate: "2026-10-22" },
    }),
    { status: 400 },
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "updateTask",
      id: range.id,
      version: range.version,
      patch: { dueDate: null },
    }),
    { status: 400 },
  );
  await assert.rejects(
    executeCommand(admin, {
      action: "bulkUpdateTasks",
      items: [
        { id: legacy.id, version: legacy.version },
        { id: range.id, version: range.version },
      ],
      patch: { dueDate: "2026-10-22" },
      idempotencyKey: crypto.randomUUID(),
    }),
    { status: 400 },
  );
  assert.equal(
    (await db.select().from(s.task).where(eq(s.task.id, legacy.id)))[0].dueDate,
    "2026-11-10",
    "failed batch rolls back earlier rows",
  );
  for (const dates of [
    { startDate: "2026-10-22", dueDate: null },
    { startDate: "2026-11-11", dueDate: "2026-11-10" },
    { startDate: "2026-02-30", dueDate: "2026-11-10" },
  ]) {
    await assert.rejects(
      db.insert(s.task).values({
        id: crypto.randomUUID(),
        title: "Invalid range",
        createdBy: admin.email,
        ...dates,
      }),
    );
  }
  const completed = await executeCommand(admin, {
    action: "updateTask",
    id: range.id,
    version: range.version,
    patch: { status: "done" },
  });
  const next = completed.tasks!.find((task) => task.id !== range.id)!;
  assert.equal(next.dueDate, "2026-12-10");
  assert.equal(
    next.startDate,
    "2026-11-22",
    "recurrence preserves duration across calendar months",
  );
  const cleared = (
    await executeCommand(admin, {
      action: "updateTask",
      id: legacy.id,
      version: legacy.version,
      patch: { startDate: null, dueDate: null },
    })
  ).task!;
  assert.equal(cleared.startDate, null);
  assert.equal(cleared.dueDate, null);
});

test("every dashboard schedule day matches full-database overlap drilldowns and attention uses existing open scopes", async () => {
  const { dashboardReport } = await import("../src/lib/workspace-reports");
  const { queryTasks } = await import("../src/lib/task-query");
  const { db } = await database();
  const before = await dashboardReport(admin, 7);
  const first = before.schedule[0].day,
    last = before.schedule[13].day;
  const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
  await db.insert(s.task).values(
    ids.map((id, index) => ({
      id,
      title: "Schedule report range",
      createdBy: admin.email,
      startDate: first,
      dueDate: last,
      status: index === 2 ? ("done" as const) : ("todo" as const),
      archived: index === 3,
    })),
  );
  try {
    const report = await dashboardReport(admin, 7);
    assert.equal(report.schedule.length, 14);
    for (const day of report.schedule) {
      const tasks = await queryTasks(
        admin,
        new URLSearchParams({
          open: "true",
          from: day.day,
          to: day.day,
          dateMode: "overlap",
          limit: "1",
        }),
      );
      assert.equal(
        tasks.total,
        day.count,
        `${day.day} schedule aggregate covers all pages and matches its drilldown`,
      );
    }
    assert.deepEqual(report.attention, {
      overdue: report.totals.overdue,
      unassigned: report.totals.unassigned,
      unscheduled: report.deadlineBuckets.unscheduled,
    });
  } finally {
    for (const id of ids) await db.delete(s.task).where(eq(s.task.id, id));
  }
});
