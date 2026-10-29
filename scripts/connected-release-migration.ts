import { Client } from "pg";
import {
  createHash,
  createDecipheriv,
  createCipheriv,
  randomBytes,
  randomUUID,
  createHmac,
} from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
async function main() {
  if (process.env.VERCEL_PROJECT_ID !== "prj_4Cvh0pTUBDKUvva5eE9GmNLFcNie")
    throw Error("Wrong release project");
  const key = Buffer.from(process.env.EVOLVE_RELEASE_RECOVERY_KEY || "", "hex");
  if (
    key.length !== 32 ||
    !process.env.EVOLVE_RELEASE_REHEARSAL_DATABASE_URL ||
    !process.env.EVOLVE_RELEASE_REHEARSAL_ID
  )
    throw Error("Verified recovery evidence is required");
  const source = new Client({
    connectionString:
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL,
  });
  const clone = new Client({
    connectionString: process.env.EVOLVE_RELEASE_REHEARSAL_DATABASE_URL,
  });
  await source.connect();
  await clone.connect();
  try {
    const identity = await source.query("SELECT current_database() name");
    const other = await clone.query("SELECT current_database() name");
    if (identity.rows[0].name === other.rows[0].name)
      throw Error("Recovery and source must be separate databases");
    const evidence = (
      await clone.query(
        "SELECT encrypted FROM release_recovery_evidence WHERE id=$1",
        [process.env.EVOLVE_RELEASE_REHEARSAL_ID],
      )
    ).rows[0]?.encrypted as Buffer | undefined;
    if (!evidence) throw Error("Recovery evidence not found");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      evidence.subarray(0, 12),
    );
    decipher.setAuthTag(evidence.subarray(12, 28));
    const verified = JSON.parse(
      gunzipSync(
        Buffer.concat([
          decipher.update(evidence.subarray(28)),
          decipher.final(),
        ]),
      ).toString(),
    ) as {
      releaseId: string;
      at: string;
      fingerprints: Record<string, string>;
      files: unknown[];
      restoreMilliseconds: number;
    };
    if (
      verified.releaseId !== process.env.EVOLVE_RELEASE_REHEARSAL_ID ||
      Date.now() - Date.parse(verified.at) > 24 * 60 * 60 * 1000 ||
      verified.restoreMilliseconds > 4 * 60 * 60 * 1000
    )
      throw Error("Recovery evidence is stale or inconsistent");
    // One transaction excludes pre-connected writers and Calendar lease claims.
    await source.query("BEGIN");
    await source.query("SET LOCAL lock_timeout='15s'");
    await source.query("SET LOCAL statement_timeout='120s'");
    for (const id of [48201603, 48201615, 48201622, 48201601])
      await source.query("SELECT pg_advisory_xact_lock($1)", [id]);
    const tables = (
      await source.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => String(r.tablename));
    for (const name of tables) {
      if (!/^[a-z_][a-z0-9_]*$/.test(name))
        throw Error("Unexpected schema identifier");
      await source.query(`LOCK TABLE public."${name}" IN EXCLUSIVE MODE`);
    }
    await source.query("SET TIME ZONE 'UTC'");
    for (const name of [
      "project",
      "task",
      "comment",
      "activity",
      "notification",
      "project_expense",
      "task_dependency",
      "task_template",
      "saved_view",
      "calendar_job",
      "calendar_event",
      "calendar_task_preference",
      "attachment",
      "board_room_project",
      "board_room_history",
      "board_room_category",
      "board_room_assignment",
    ]) {
      if (!/^[a-z_]+$/.test(name)) throw Error("Unexpected table");
      const hash = (
        await source.query(
          `SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) hash FROM public."${name}" t`,
        )
      ).rows[0].hash;
      if (hash !== verified.fingerprints[name])
        throw Error(
          "Source data changed since backup; repeat recovery rehearsal: " +
            name,
        );
    }
    if (
      (
        await source.query(
          "SELECT 1 FROM calendar_job WHERE lease_until>now() LIMIT 1",
        )
      ).rows.length
    )
      throw Error("Drain Calendar leases before release");
    if (
      (
        await source.query(
          "SELECT 1 FROM attachment WHERE state<>'ready' LIMIT 1",
        )
      ).rows.length
    )
      throw Error("Wait for pending storage cleanup before release");
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile("migrations/" + name, "utf8"),
        hash = createHash("sha256").update(sql).digest("hex");
      const applied = (
        await source.query("SELECT hash FROM evolve_migration WHERE name=$1", [
          name,
        ])
      ).rows[0];
      if (applied) {
        if (applied.hash !== hash)
          throw Error("Applied migration checksum changed");
        continue;
      }
      for (const statement of sql
        .split("-- statement-breakpoint")
        .map((q) => q.trim())
        .filter(Boolean))
        await source.query(statement);
      await source.query(
        "INSERT INTO evolve_migration(name,hash) VALUES($1,$2)",
        [name, hash],
      );
    }
    const migrations = (
      await source.query("SELECT name FROM evolve_migration ORDER BY name")
    ).rows.map((r) => r.name);
    if (!migrations.includes("0037_upload_request_receipts.sql"))
      throw Error("Required schema missing");
    const user = (
      await source.query(
        "SELECT id FROM auth_user WHERE lower(email)=lower($1)",
        [process.env.ADMIN_EMAIL],
      )
    ).rows[0];
    if (!user || !process.env.BETTER_AUTH_SECRET)
      throw Error("Release verification identity unavailable");
    const id = "release-" + randomUUID(),
      token = randomBytes(32).toString("hex");
    await source.query(
      "INSERT INTO auth_session(id,user_id,token,expires_at,user_agent) VALUES($1,$2,$3,now()+interval '4 hours','Production release verification')",
      [id, user.id, token],
    );
    const cookie = encodeURIComponent(
      token +
        "." +
        createHmac("sha256", process.env.BETTER_AUTH_SECRET)
          .update(token)
          .digest("base64"),
    );
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(
        JSON.stringify({
          sessionId: id,
          cookie,
          releaseId: verified.releaseId,
        }),
      ),
      cipher.final(),
    ]);
    const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    await source.query("COMMIT");
    const path = "public/__release-recovery/" + verified.releaseId;
    await mkdir(path, { recursive: true });
    await writeFile(path + "/verification.bin", packed);
    console.log(
      "EVOLVE_MIGRATION_VERIFIED " +
        JSON.stringify({
          releaseId: verified.releaseId,
          migrations,
          path: "/" + path.slice(7) + "/verification.bin",
          sha256: createHash("sha256").update(packed).digest("hex"),
          connectedActivated: false,
        }),
    );
  } finally {
    await source.query("ROLLBACK").catch(() => {});
    await clone.end();
    await source.end();
  }
}
main().catch((e) => {
  console.error(
    "EVOLVE_MIGRATION_FAILED",
    e instanceof Error ? e.message : "unknown",
  );
  process.exitCode = 1;
});
