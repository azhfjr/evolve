import { Client } from "pg";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import {
  createHash,
  createCipheriv,
  randomBytes,
  randomUUID,
  createHmac,
} from "node:crypto";
import { gzipSync } from "node:zlib";
import { get, list } from "@vercel/blob";
const project = "prj_4Cvh0pTUBDKUvva5eE9GmNLFcNie";
function identifier(n: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw Error("Unexpected identifier");
  return '"' + n + '"';
}
async function migrate(db: Client, names: string[]) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS evolve_migration(name text PRIMARY KEY,hash text NOT NULL,applied_at timestamp NOT NULL DEFAULT now())",
  );
  for (const name of names) {
    const text = await readFile("migrations/" + name, "utf8"),
      hash = createHash("sha256").update(text).digest("hex");
    const applied = (
      await db.query("SELECT hash FROM evolve_migration WHERE name=$1", [name])
    ).rows[0];
    if (applied) {
      if (applied.hash !== hash) throw Error("Migration checksum mismatch");
      continue;
    }
    await db.query("BEGIN");
    try {
      for (const q of text
        .split("-- statement-breakpoint")
        .map((v) => v.trim())
        .filter(Boolean))
        await db.query(q);
      await db.query("INSERT INTO evolve_migration(name,hash) VALUES($1,$2)", [
        name,
        hash,
      ]);
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
}
async function main() {
  if (process.env.VERCEL_PROJECT_ID !== project) throw Error("Wrong project");
  const key = Buffer.from(process.env.EVOLVE_RELEASE_RECOVERY_KEY || "", "hex");
  if (key.length !== 32) throw Error("Recovery key is required");
  const connection =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL;
  if (!connection) throw Error("Missing managed database");
  const source = new Client({ connectionString: connection });
  await source.connect();
  await source.query("SET TIME ZONE 'UTC'");
  const started = Date.now(),
    releaseId = randomUUID(),
    cloneName = "evolve_preview_" + releaseId.replaceAll("-", "").slice(0, 16),
    url = new URL(connection);
  url.pathname = "/" + cloneName;
  let clone: Client | undefined;
  try {
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await source.query("SELECT pg_advisory_xact_lock(48201603)");
    const names = (
      await source.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => String(r.tablename));
    for (const needed of [
      "task",
      "project",
      "attachment",
      "board_room_project",
    ])
      if (!names.includes(needed)) throw Error("Unexpected source schema");
    const migrations = (
      await source.query("SELECT name,hash FROM evolve_migration ORDER BY name")
    ).rows as { name: string; hash: string }[];
    for (const m of migrations)
      if (
        createHash("sha256")
          .update(await readFile("migrations/" + m.name))
          .digest("hex") !== m.hash
      )
        throw Error("Source migration differs from release");
    const rows: Record<string, string> = {},
      fingerprints: Record<string, string> = {},
      counts: Record<string, number> = {};
    for (const name of names) {
      const q = identifier(name);
      const r = (
        await source.query(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text payload,count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${q} t`,
        )
      ).rows[0];
      rows[name] = r.payload;
      counts[name] = r.n;
      fingerprints[name] = r.hash;
    }
    const dependencies = (
      await source.query(
        "SELECT a.relname AS name,b.relname AS dependency FROM pg_constraint c JOIN pg_class a ON a.oid=c.conrelid JOIN pg_class b ON b.oid=c.confrelid JOIN pg_namespace n ON n.oid=a.relnamespace WHERE c.contype='f' AND n.nspname='public' AND a.oid<>b.oid",
      )
    ).rows as { name: string; dependency: string }[];
    const files: Record<string, unknown>[] = [];
    const ready = (
      await source.query(
        "SELECT id,storage_path,size,content_type FROM attachment WHERE state='ready' ORDER BY id",
      )
    ).rows;
    if (ready.reduce((n, f) => n + Number(f.size), 0) > 100 * 1024 * 1024)
      throw Error("Backup requires a larger reviewed streaming plan");
    for (const f of ready) {
      const result = await get(f.storage_path, {
        access: "private",
        useCache: false,
      });
      if (!result?.stream) throw Error("Private evidence unavailable");
      const parts: Buffer[] = [];
      for await (const part of result.stream as unknown as AsyncIterable<Uint8Array>)
        parts.push(Buffer.from(part));
      const bytes = Buffer.concat(parts);
      if (bytes.length !== Number(f.size))
        throw Error("Private evidence size mismatch");
      files.push({
        id: f.id,
        path: f.storage_path,
        size: f.size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        base64: bytes.toString("base64"),
      });
    }
    await source.query("ROLLBACK");
    const provider = process.env.BLOB_READ_WRITE_TOKEN
      ? await list({ limit: 1 })
      : null;
    await source.query(`CREATE DATABASE ${identifier(cloneName)}`);
    clone = new Client({ connectionString: url.toString() });
    await clone.connect();
    await clone.query("SET TIME ZONE 'UTC'");
    await migrate(
      clone,
      migrations.map((m) => m.name),
    );
    for (const n of names)
      await clone.query(
        `ALTER TABLE public.${identifier(n)} DISABLE TRIGGER USER`,
      );
    await clone.query(
      "TRUNCATE " +
        names.map((n) => "public." + identifier(n)).join(",") +
        " CASCADE",
    );
    const pending = new Set(names),
      ordered: string[] = [];
    while (pending.size) {
      const available = [...pending].filter((n) =>
        dependencies
          .filter((d) => d.name === n)
          .every((d) => !pending.has(d.dependency)),
      );
      if (!available.length)
        throw Error("Cross-table dependency cycle needs explicit restoration");
      for (const n of available) {
        ordered.push(n);
        pending.delete(n);
      }
    }
    for (const n of ordered)
      await clone.query(
        `INSERT INTO public.${identifier(n)} SELECT * FROM jsonb_populate_recordset(NULL::public.${identifier(n)},$1::jsonb)`,
        [rows[n]],
      );
    for (const n of names) {
      const hash = (
        await clone.query(
          `SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${identifier(n)} t`,
        )
      ).rows[0].hash;
      if (hash !== fingerprints[n])
        throw Error("Restored table fingerprint mismatch: " + n);
      await clone.query(
        `ALTER TABLE public.${identifier(n)} ENABLE TRIGGER USER`,
      );
    }
    const restoreMilliseconds = Date.now() - started;
    const all = (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort();
    await migrate(clone, all);
    process.env.DATABASE_URL = url.toString();
    const { transitionPreview, activateConnectedWorkspace } =
      await import("../src/lib/connected/transition");
    const actor = {
      email: process.env.ADMIN_EMAIL!,
      name: "Release operator",
      isAdmin: true,
    };
    const preview = await transitionPreview(actor);
    const archive = await activateConnectedWorkspace(actor, {
      token: preview.token,
      recoveryEvidence:
        "Verified provider restore " +
        releaseId +
        "; every public table fingerprint reconciled and private file bytes captured.",
    });
    const { database } = await import("../src/lib/db");
    await (await database()).close();
    await clone.query("UPDATE calendar_connection SET enabled=false");
    await clone.query(
      "UPDATE workspace_setting SET configuration=jsonb_set(configuration,'{calendarEnabled}','false'::jsonb)",
    );
    await clone.query("DELETE FROM auth_session");
    await clone.query("DELETE FROM auth_account");
    const user = (
      await clone.query(
        "SELECT id FROM auth_user WHERE lower(email)=lower($1)",
        [process.env.ADMIN_EMAIL],
      )
    ).rows[0];
    if (!user) throw Error("Release user unavailable");
    const previewSecret = randomBytes(32).toString("hex"),
      token = randomBytes(32).toString("hex"),
      sessionId = "preview-" + releaseId;
    await clone.query(
      "INSERT INTO auth_session(id,user_id,token,expires_at,user_agent) VALUES($1,$2,$3,now()+interval '4 hours','Isolated release verification')",
      [sessionId, user.id, token],
    );
    const cookie = encodeURIComponent(
      token +
        "." +
        createHmac("sha256", previewSecret).update(token).digest("base64"),
    );
    const backup = {
      releaseId,
      at: new Date().toISOString(),
      rows,
      fingerprints,
      files,
      cloneUrl: url.toString(),
      previewSecret,
      previewCookie: cookie,
      previewSessionId: sessionId,
      counts,
      restoreMilliseconds,
      archive,
    };
    const plain = gzipSync(Buffer.from(JSON.stringify(backup))),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      encrypted = Buffer.concat([cipher.update(plain), cipher.final()]),
      packed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    const path = "public/__release-recovery/" + releaseId;
    await mkdir(path, { recursive: true });
    await writeFile(path + "/backup.bin", packed);
    await clone.query(
      "CREATE TABLE release_recovery_evidence(id text PRIMARY KEY,encrypted bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now())",
    );
    await clone.query(
      "INSERT INTO release_recovery_evidence(id,encrypted) VALUES($1,$2)",
      [releaseId, packed],
    );
    console.log(
      "EVOLVE_RECOVERY_VERIFIED " +
        JSON.stringify({
          releaseId,
          path: "/" + path.slice(7) + "/backup.bin",
          sha256: createHash("sha256").update(packed).digest("hex"),
          tables: names.length,
          counts,
          readyFiles: files.length,
          providerReadAuthenticated: !!provider,
          restoreMilliseconds,
          archive,
          productionMigrated: false,
        }),
    );
  } finally {
    await source.query("ROLLBACK").catch(() => {});
    await clone?.end();
    await source.end();
  }
}
main().catch((e) => {
  console.error(
    "EVOLVE_RECOVERY_FAILED",
    e instanceof Error ? e.message : "unknown",
  );
  process.exitCode = 1;
});
