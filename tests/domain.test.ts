import { test } from "node:test";
import { authConfigured } from "../src/lib/auth";
import assert from "node:assert/strict";
import {
  resolveActor,
  checkMutationOrigin,
  AppError,
  requireAdmin,
} from "../src/lib/permissions";
import { commandSchema, taskFields } from "../src/lib/validation";
import { csvExport } from "../src/lib/utils";
import { createDemo } from "../src/lib/demo";
const admin = "jarjirjor777@gmail.com";
const member = {
  email: "teammate@example.com",
  name: "Team Member",
  color: "blue",
  disabled: false,
};
test("anonymous identities cannot access organization data", () =>
  assert.throws(() => resolveActor(null, [member], admin), { status: 401 }));
test("a verified Google account alone does not grant membership", () =>
  assert.throws(
    () =>
      resolveActor(
        {
          email: "outsider@example.com",
          name: "Outsider",
          emailVerified: true,
        },
        [member],
        admin,
      ),
    { status: 403 },
  ));
test("unverified identities are denied even when email matches the administrator", () =>
  assert.throws(
    () =>
      resolveActor(
        { email: admin, name: "Admin", emailVerified: false },
        [],
        admin,
      ),
    { status: 403 },
  ));
test("admin is derived only from the configured email", () => {
  const actor = resolveActor(
    { email: admin.toUpperCase(), name: "Admin", emailVerified: true },
    [],
    admin,
  );
  assert.equal(actor.isAdmin, true);
  const normal = resolveActor(
    { email: member.email, name: member.name, emailVerified: true },
    [member],
    admin,
  );
  assert.equal(normal.isAdmin, false);
  assert.throws(() => requireAdmin(normal), { status: 403 });
});
test("revoked members lose access immediately", () =>
  assert.throws(
    () =>
      resolveActor(
        { email: member.email, name: member.name, emailVerified: true },
        [{ ...member, disabled: true }],
        admin,
      ),
    { status: 403 },
  ));
test("missing administrator configuration fails closed", () =>
  assert.throws(
    () =>
      resolveActor(
        { email: admin, name: "Admin", emailVerified: true },
        [],
        undefined,
      ),
    { status: 503 },
  ));
test("write requests require the exact trusted origin", () => {
  assert.doesNotThrow(() =>
    checkMutationOrigin(
      "https://evolve.example.com",
      "https://evolve.example.com",
    ),
  );
  for (const origin of [
    null,
    "https://evil.example",
    "https://evolve.example.com.evil.test",
    "http://evolve.example.com",
  ])
    assert.throws(
      () => checkMutationOrigin(origin, "https://evolve.example.com"),
      AppError,
    );
});
test("task validation trims titles and rejects impossible calendar dates", () => {
  assert.equal(
    taskFields.parse({ title: "  A clear next step  " }).title,
    "A clear next step",
  );
  for (const date of ["2026-02-30", "2026-13-01", "today"]) {
    assert.equal(
      taskFields.safeParse({ title: "Task", dueDate: date }).success,
      false,
    );
  }
  assert.equal(
    taskFields.safeParse({ title: "Task", dueDate: "2028-02-29" }).success,
    true,
  );
});
test("request validation rejects role escalation and arbitrary patch fields", () => {
  assert.equal(
    commandSchema.safeParse({
      action: "inviteMember",
      email: "me@example.com",
      name: "Me",
      isAdmin: true,
    }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      action: "updateTask",
      id: crypto.randomUUID(),
      version: 1,
      patch: { createdBy: admin },
    }).success,
    false,
  );
});
test("large fields, invalid statuses, and invalid versions are rejected", () => {
  assert.equal(taskFields.safeParse({ title: "x".repeat(201) }).success, false);
  assert.equal(
    taskFields.safeParse({ title: "Task", status: "invalid" }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      action: "updateTask",
      id: crypto.randomUUID(),
      version: 0,
      patch: { title: "Valid" },
    }).success,
    false,
  );
});
test("CSV export preserves newlines and neutralizes spreadsheet formula injection", () => {
  const data = createDemo();
  const task = {
    ...data.tasks[0],
    title: "=SUM(1,2)",
    description: 'Quote "with"\nnewline',
  };
  const csv = csvExport([task]);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"Quote ""with""\nnewline"'));
});

test("partial task updates never introduce creation defaults", () => {
  const parsed = commandSchema.parse({
    action: "updateTask",
    id: crypto.randomUUID(),
    version: 1,
    patch: { status: "done" },
  });
  assert.equal(parsed.action, "updateTask");
  if (parsed.action === "updateTask")
    assert.deepEqual(parsed.patch, { status: "done" });
  const archive = commandSchema.parse({
    action: "updateTask",
    id: crypto.randomUUID(),
    version: 1,
    patch: { archived: true },
  });
  if (archive.action === "updateTask")
    assert.deepEqual(archive.patch, { archived: true });
  assert.equal(
    commandSchema.safeParse({
      action: "updateTask",
      id: crypto.randomUUID(),
      version: 1,
      patch: {},
    }).success,
    false,
  );
});

test("Vercel readiness rejects local persistence and insecure auth origins", () => {
  const keys = [
    "VERCEL",
    "DATABASE_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "ADMIN_EMAIL",
    "EVOLVE_LOCAL_DATABASE",
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, {
      VERCEL: "1",
      DATABASE_URL: "postgresql://unused-test-host/evolve",
      BETTER_AUTH_URL: "https://evolve.example.com",
      BETTER_AUTH_SECRET: "test-only-32-character-secret-not-for-production",
      GOOGLE_CLIENT_ID: "test-only",
      GOOGLE_CLIENT_SECRET: "test-only",
      ADMIN_EMAIL: admin,
    });
    delete process.env.EVOLVE_LOCAL_DATABASE;
    assert.equal(authConfigured(), true);
    process.env.EVOLVE_LOCAL_DATABASE = "1";
    assert.equal(authConfigured(), false);
    delete process.env.EVOLVE_LOCAL_DATABASE;
    process.env.BETTER_AUTH_URL = "http://evolve.example.com";
    assert.equal(authConfigured(), false);
    process.env.BETTER_AUTH_URL = "https://evolve.example.com";
    delete process.env.DATABASE_URL;
    assert.equal(authConfigured(), false);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
