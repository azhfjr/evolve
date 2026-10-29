// Destructive operations are restricted to a newly created disposable database
// inside the known local test container. No production URLs or Blob tokens are read.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const container = "evolve-development-db";
const restored = `evolve_recovery_${randomUUID().replaceAll("-", "")}`;
function docker(args: string[], input?: Buffer) {
  const result = spawnSync(
    "docker",
    ["exec", ...(input ? ["-i"] : []), container, ...args],
    { input, maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
  );
  if (result.status !== 0)
    throw new Error(
      `Local recovery command failed: ${args[0]}: ${result.stderr
        .toString()
        .split("\n")
        .filter((line) => /error:|ERROR:/.test(line))
        .slice(0, 2)
        .join("; ")}`,
    );
  return result.stdout;
}
async function main() {
  const inspection = spawnSync("docker", ["inspect", container], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (inspection.status !== 0)
    throw Error("Known local development container is unavailable.");
  const info = JSON.parse(inspection.stdout)[0];
  const bindings = info.HostConfig?.PortBindings?.["5432/tcp"] || [];
  if (
    !bindings.some(
      (b: { HostIp: string; HostPort: string }) =>
        b.HostIp === "127.0.0.1" && b.HostPort === "54329",
    )
  )
    throw Error(
      "Recovery drill requires the local-only development PostgreSQL container.",
    );
  const startedAt = Date.now();
  const tables = docker([
    "psql",
    "-U",
    "evolve",
    "-d",
    "evolve_e2e",
    "-At",
    "-c",
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  ])
    .toString()
    .trim()
    .split("\n");
  if (!tables.length || tables.some((name) => !/^[a-z][a-z0-9_]*$/.test(name)))
    throw Error("Unexpected local fixture schema; review the recovery drill.");
  // Compare row counts and deterministic content fingerprints for every public
  // fixture table, without returning row contents or authentication values.
  const sql =
    tables
      .map(
        (name) =>
          `SELECT '${name}:'||count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM public."${name}" t`,
      )
      .join(" UNION ALL ") + " ORDER BY 1";
  const expected = docker([
    "psql",
    "-U",
    "evolve",
    "-d",
    "evolve_e2e",
    "-At",
    "-c",
    sql,
  ])
    .toString()
    .trim();
  const dump = docker([
    "pg_dump",
    "-U",
    "evolve",
    "-d",
    "evolve_e2e",
    "--format=custom",
    "--no-owner",
    "--no-acl",
  ]);
  let created = false;
  const directory = await mkdtemp(join(tmpdir(), "evolve-recovery-"));
  try {
    docker(["createdb", "-U", "evolve", restored]);
    created = true;
    // pg_dump empties search_path. Existing project CHECK helper bodies resolve
    // sibling public functions at runtime during COPY, so restore this trusted
    // local dump with pg_catalog first and public explicitly available.
    const restoreSQL = docker(
      ["pg_restore", "--no-owner", "--no-acl", "--file=-"],
      dump,
    ).toString();
    const emptyPath = "SELECT pg_catalog.set_config('search_path', '', false);";
    if (!restoreSQL.includes(emptyPath))
      throw Error(
        "Unexpected dump search-path contract; review restore procedure.",
      );
    const scopedSQL = restoreSQL.replaceAll(
      emptyPath,
      "SELECT pg_catalog.set_config('search_path', 'pg_catalog, public', false);",
    );
    docker(
      [
        "psql",
        "-U",
        "evolve",
        "-d",
        restored,
        "--set=ON_ERROR_STOP=1",
        "--quiet",
      ],
      Buffer.from(scopedSQL),
    );
    const actual = docker([
      "psql",
      "-U",
      "evolve",
      "-d",
      restored,
      "-At",
      "-c",
      sql,
    ])
      .toString()
      .trim();
    if (actual !== expected)
      throw Error(
        "Restored fixture row counts or content fingerprints did not match.",
      );
    const live = join(directory, "synthetic-private-document.txt"),
      backup = join(directory, "file-backup.txt"),
      recovered = join(directory, "recovered.txt");
    await writeFile(
      live,
      "Synthetic private document: local recovery drill only.\n",
    );
    await copyFile(live, backup);
    await rm(live);
    await copyFile(backup, recovered);
    const hash = (data: Buffer) =>
      createHash("sha256").update(data).digest("hex");
    if (hash(await readFile(backup)) !== hash(await readFile(recovered)))
      throw Error("Recovered synthetic file checksum differs.");
    console.log(
      JSON.stringify({
        status: "passed",
        scope:
          "disposable local PostgreSQL dump/restore and synthetic local file copy",
        recordCounts: actual
          .split("\n")
          .map((line) => line.split(":").slice(0, 2).join(":")),
        tablesVerified: tables.length,
        tableContentFingerprintsMatch: true,
        elapsedMs: Date.now() - startedAt,
        productionRestoreTested: false,
        blobRestoreTested: false,
      }),
    );
  } finally {
    if (created) docker(["dropdb", "-U", "evolve", restored]);
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Local recovery drill failed.",
  );
  process.exitCode = 1;
});
