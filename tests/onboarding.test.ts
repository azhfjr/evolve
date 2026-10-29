import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database } from "../src/lib/db";
import { executeCommand } from "../src/lib/service";
import { administrationReport } from "../src/lib/workspace-reports";
import * as s from "../src/lib/db/schema";
process.env.DATABASE_URL = "";
process.env.ADMIN_EMAIL = "onboarding-admin@example.test";
process.env.BETTER_AUTH_URL = "https://evolve.example.test";
const admin = { email: process.env.ADMIN_EMAIL, name: "Admin", isAdmin: true };
let directory: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "evolve-onboarding-"));
  process.env.EVOLVE_DATA_DIR = join(directory, "db");
  const { db } = await database();
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await (
      db as unknown as { $client: { exec: (s: string) => Promise<unknown> } }
    ).$client.exec(await readFile(`migrations/${name}`, "utf8"));
  await db.insert(s.member).values({ email: admin.email, name: admin.name });
});
after(async () => {
  await (await database()).close();
  await rm(directory, { recursive: true, force: true });
});
test("approval returns canonical onboarding link and keeps account registration separate from sessions", async () => {
  const result = await executeCommand(admin, {
    action: "inviteMember",
    name: "Approved",
    email: "approved@example.test",
  });
  assert.equal(
    (result as Record<string, unknown>).onboardingUrl,
    "https://evolve.example.test/workspace",
  );
  const { db } = await database();
  await db.insert(s.user).values({
    id: crypto.randomUUID(),
    email: "approved@example.test",
    name: "Approved",
    emailVerified: true,
  });
  await executeCommand(admin, {
    action: "inviteMember",
    name: "Waiting",
    email: "waiting@example.test",
  });
  const report = await administrationReport(admin);
  assert.equal(
    report.sessions.find(
      (row: { email: string }) => row.email === "approved@example.test",
    ).accountRegistered,
    true,
  );
  assert.equal(
    report.sessions.find(
      (row: { email: string }) => row.email === "approved@example.test",
    ).activeSessions,
    0,
  );
  assert.equal(
    report.sessions.find(
      (row: { email: string }) => row.email === "waiting@example.test",
    ).accountRegistered,
    false,
  );
});
test("membership report rejects forged admin flags and ordinary members", async () => {
  await assert.rejects(
    administrationReport({ ...admin, email: "forged@example.test" }),
    { status: 403 },
  );
  await assert.rejects(administrationReport({ ...admin, isAdmin: false }), {
    status: 403,
  });
});
