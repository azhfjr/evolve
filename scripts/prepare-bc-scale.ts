import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { scaleDatabaseURL, SCALE_ADMIN } from "./scale-environment";
config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const target = scaleDatabaseURL();
  target.pathname = "/evolve_connected_perf";
  const prepared = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/prepare-connected-scale.ts"],
    { stdio: "inherit", env: { ...process.env, EVOLVE_BC_SCALE: "1" } },
  );
  if (prepared.status !== 0) throw Error("Base scale fixture failed");
  const db = new Client({ connectionString: target.toString() });
  await db.connect();
  const body = "Synthetic scale document.\n",
    bytes = Buffer.byteLength(body);
  try {
    await db.query("BEGIN");
    await db.query(
      `INSERT INTO attachment(id,entity_type,entity_id,owner_email,filename,content_type,size,storage_path,state) SELECT '40000000-0000-4000-8000-'||lpad(i::text,12,'0'),'boardRoomProject','10000000-0000-4000-8000-'||lpad(i::text,12,'0'),$1,'Scale evidence '||i||'.txt','text/plain',$2,'evolve-files/40000000-0000-4000-8000-'||lpad(i::text,12,'0')||'/txt','ready' FROM generate_series(1,2000) i`,
      [SCALE_ADMIN, bytes],
    );
    await db.query(
      `INSERT INTO attachment(id,document_id,version_number,replaces_attachment_id,entity_type,entity_id,owner_email,filename,content_type,size,storage_path,state) SELECT '50000000-0000-4000-8000-'||lpad(i::text,12,'0'),'40000000-0000-4000-8000-'||lpad(i::text,12,'0'),2,'40000000-0000-4000-8000-'||lpad(i::text,12,'0'),'boardRoomProject','10000000-0000-4000-8000-'||lpad(i::text,12,'0'),$1,'Revised evidence.txt','text/plain',$2,'evolve-files/50000000-0000-4000-8000-'||lpad(i::text,12,'0')||'/txt','ready' FROM generate_series(1,200) i`,
      [SCALE_ADMIN, bytes],
    );
    for (const [prefix, state, version] of [
      ["60000000", "pending", 3],
      ["70000000", "deleting", 4],
    ] as const)
      await db.query(
        `INSERT INTO attachment(id,document_id,version_number,entity_type,entity_id,owner_email,filename,content_type,size,storage_path,state) SELECT $3||'-0000-4000-8000-'||lpad(i::text,12,'0'),'40000000-0000-4000-8000-'||lpad(i::text,12,'0'),$4,'boardRoomProject','10000000-0000-4000-8000-'||lpad(i::text,12,'0'),$1,'Incomplete evidence.txt','text/plain',$2,'evolve-files/'||$3||'-0000-4000-8000-'||lpad(i::text,12,'0')||'/txt',$5 FROM generate_series(1,20) i`,
        [SCALE_ADMIN, bytes, prefix, version, state],
      );
    await db.query("COMMIT");
    const rows = await db.query("SELECT storage_path FROM attachment");
    for (const row of rows.rows) {
      const path = ".data/connected-scale-files/" + row.storage_path;
      await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      await writeFile(path, body);
    }
    await db.query("ANALYZE");
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/bc-scale-fixture.json",
      JSON.stringify({
        projects: 2000,
        assets: 10000,
        tasks: 20000,
        logicalDocuments: 2000,
        files: 2240,
        allocatedBytes: bytes * 2240,
        bytesPerFile: bytes,
      }),
    );
    console.log(
      "Prepared isolated B/C fixture: 2,000 projects, 10,000 assets, 20,000 tasks, 2,000 documents / 2,240 file versions.",
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
