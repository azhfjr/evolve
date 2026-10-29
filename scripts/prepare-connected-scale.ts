import { config } from "dotenv";
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import {
  scaleDatabaseURL,
  SCALE_ADMIN,
  SCALE_SECRET,
} from "./scale-environment";
config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const target = scaleDatabaseURL();
  target.pathname = "/evolve_connected_perf";
  const root = new URL(target);
  root.pathname = "/postgres";
  const control = new Client({ connectionString: root.toString() });
  await control.connect();
  try {
    if (
      !(
        await control.query(
          "SELECT 1 FROM pg_database WHERE datname='evolve_connected_perf'",
        )
      ).rowCount
    )
      await control.query("CREATE DATABASE evolve_connected_perf");
  } finally {
    await control.end();
  }
  const migration = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts"],
    {
      env: { ...process.env, DATABASE_URL: target.toString() },
      encoding: "utf8",
    },
  );
  if (migration.status !== 0) throw Error("Disposable migration failed.");
  const db = new Client({ connectionString: target.toString() });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "UPDATE connected_workspace SET enabled=false WHERE id='primary'",
    );
    await db.query(
      "TRUNCATE legacy_record,logical_document,asset_history,asset_import_receipt,canonical_import_receipt,meeting_action_link,meeting_pack,workspace_change,personal_project,board_room_history,board_room_project,attachment,calendar_job,calendar_event,calendar_connection,task_template,command_receipt,notification,activity,comment,task,project,member,auth_session,auth_account,auth_user CASCADE",
    );
    await db.query("INSERT INTO member(email,name) VALUES($1,'Scale admin')", [
      SCALE_ADMIN,
    ]);
    await db.query(
      "INSERT INTO auth_user(id,email,name,email_verified) VALUES('connected-scale',$1,'Scale admin',true)",
      [SCALE_ADMIN],
    );
    const token = randomUUID();
    await db.query(
      "INSERT INTO auth_session(id,user_id,token,expires_at) VALUES($1,'connected-scale',$2,now()+interval '1 day')",
      [randomUUID(), token],
    );
    await db.query(
      `INSERT INTO board_room_project(id,external_id,data) SELECT '10000000-0000-4000-8000-'||lpad(i::text,12,'0'),'SCALE-'||i,jsonb_build_object('externalId','SCALE-'||i,'name','Scale project '||i,'category','Pembangkit','capacity',100,'unit','MW','startYear',2026,'codYear',2028,'stage',3,'completed',false,'description','','location','Kalimantan Timur','voltage','150 kV','links','[]'::jsonb,'linkLabels','[]'::jsonb) FROM generate_series(1,1000) i`,
    );
    await db.query(
      "UPDATE connected_workspace SET enabled=true WHERE id='primary'",
    );
    await db.query("UPDATE board_room_project SET data=data");
    await db.query(
      `INSERT INTO board_asset(id,code,project_id,data) SELECT '20000000-0000-4000-8000-'||lpad(i::text,12,'0'),'ASSET-'||i,'10000000-0000-4000-8000-'||lpad((CASE WHEN i<=1000 THEN 1 ELSE (i-1)%999+2 END)::text,12,'0'),jsonb_build_object('name','Scale asset '||i,'category','Pembangkit','capacity',10,'unit','MW','location','Kalimantan Timur','voltage','150 kV') FROM generate_series(1,10000) i`,
    );
    await db.query(
      `INSERT INTO task(id,title,project_id,assignee,created_by,due_date) SELECT '30000000-0000-4000-8000-'||lpad(i::text,12,'0'),'Scale task '||i,'10000000-0000-4000-8000-'||lpad((CASE WHEN i<=1000 THEN 1 ELSE (i-1)%999+2 END)::text,12,'0'),$1,$1,(CURRENT_DATE+(i%20-10))::text FROM generate_series(1,20000) i`,
      [SCALE_ADMIN],
    );
    await db.query("COMMIT");
    await db.query("ANALYZE");
    const plans: Record<string, unknown> = {};
    for (const [name, query] of Object.entries({
      assetsByProject:
        "SELECT id,code FROM board_asset WHERE project_id='10000000-0000-4000-8000-000000000001' ORDER BY code LIMIT 50",
      tasksByProject:
        "SELECT id,title FROM task WHERE project_id='10000000-0000-4000-8000-000000000001' ORDER BY created_at DESC LIMIT 100",
    })) {
      const r = await db.query(
        "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + query,
      );
      plans[name] = r.rows[0]["QUERY PLAN"];
    }
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/connected-scale-query-plans.json",
      JSON.stringify(plans, null, 2),
    );

    await mkdir(".data", { recursive: true });
    await writeFile(
      ".data/connected-scale-auth.json",
      JSON.stringify({
        admin: encodeURIComponent(
          token +
            "." +
            createHmac("sha256", SCALE_SECRET).update(token).digest("base64"),
        ),
      }),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        database: "evolve_connected_perf",
        projects: 1000,
        assets: 10000,
        tasks: 20000,
        productionChanged: false,
      }),
    );
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Scale fixture failed");
  process.exitCode = 1;
});
