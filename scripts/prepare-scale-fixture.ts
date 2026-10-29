import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  scaleDatabaseURL,
  SCALE_ADMIN,
  SCALE_MEMBER,
  SCALE_SECRET,
} from "./scale-environment";
async function main() {
  const target = scaleDatabaseURL();
  const root = new URL(target);
  root.pathname = "/postgres";
  const control = new Client({ connectionString: root.toString() });
  await control.connect();
  try {
    if (
      !(
        await control.query(
          "SELECT 1 FROM pg_database WHERE datname='evolve_perf'",
        )
      ).rowCount
    )
      await control.query("CREATE DATABASE evolve_perf");
  } finally {
    await control.end();
  }
  const migrated = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts"],
    {
      env: { ...process.env, DATABASE_URL: target.toString() },
      encoding: "utf8",
    },
  );
  if (migrated.status !== 0)
    throw new Error(
      "Disposable scale migration failed; no production destination is supported.",
    );
  const db = new Client({ connectionString: target.toString() });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "TRUNCATE board_room_history,board_room_project,attachment,calendar_oauth_state,calendar_job,calendar_event,calendar_connection,task_template,command_receipt,notification,activity,comment,task,project,member,auth_session,auth_account,auth_user,api_rate,auth_rate_limit,auth_verification CASCADE",
    );
    await db.query(
      "UPDATE workspace_setting SET configuration='{}',version=1,revision=0 WHERE id='primary'",
    );
    await db.query(
      "INSERT INTO member(email,name) VALUES($1,'Scale Administrator'),($2,'Scale Member')",
      [SCALE_ADMIN, SCALE_MEMBER],
    );
    await db.query(
      "INSERT INTO auth_user(id,name,email,email_verified) VALUES('scale-admin','Scale Administrator',$1,true),('scale-member','Scale Member',$2,true)",
      [SCALE_ADMIN, SCALE_MEMBER],
    );
    const auth: Record<string, string> = {};
    for (const [id, label] of [
      ["scale-admin", "admin"],
      ["scale-member", "member"],
    ]) {
      const token = randomUUID();
      await db.query(
        "INSERT INTO auth_session(id,user_id,token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
        [randomUUID(), id, token],
      );
      auth[label] = encodeURIComponent(
        token +
          "." +
          createHmac("sha256", SCALE_SECRET).update(token).digest("base64"),
      );
    }
    await db.query(`INSERT INTO board_room_project(id,external_id,data)
 SELECT '10000000-0000-4000-8000-'||lpad(i::text,12,'0'),'PERF-'||i,
 jsonb_build_object('externalId','PERF-'||i,'name','Scale power project '||i,'category',(ARRAY['Pembangkit','Transmisi','Gardu Induk'])[i%3+1],'capacity',i/10.0,'unit',(ARRAY['MW','kms','MVA'])[i%3+1],'startYear',2025+i%15,'codYear',2026+i%15,'stage',i%11,'completed',i%11=10 AND i%2=0,'description',repeat('Synthetic scale record. ',50),'scope','Isolated scale fixture','voltage','150 kV','location',(ARRAY['Kalimantan Barat','Kalimantan Tengah','Kalimantan Selatan','Kalimantan Timur','Kalimantan Utara'])[i%5+1],'links','[]'::jsonb,'linkLabels','[]'::jsonb,'responsible',CASE WHEN i%7=0 THEN '' ELSE 'Scale Member' END,'progressReviewedAt',CASE WHEN i%4=0 THEN now()-interval '45 days' WHEN i%3=0 THEN now() ELSE NULL END,'progressReviewedBy',NULL,'progressReviewNote','') FROM generate_series(1,5000) i`);
    await db.query(
      `INSERT INTO project(id,name) SELECT '20000000-0000-4000-8000-'||lpad(i::text,12,'0'),'Scale task project '||i FROM generate_series(1,500) i`,
    );
    await db.query(
      `INSERT INTO task(id,title,description,project_id,assignee,status,priority,due_date,created_by,archived)
 SELECT '30000000-0000-4000-8000-'||lpad(i::text,12,'0'),'Scale task '||i,'Synthetic task for isolated performance checks','20000000-0000-4000-8000-'||lpad((i%500+1)::text,12,'0'),CASE WHEN i%2=0 THEN $1 ELSE $2 END,(ARRAY['backlog','todo','in_progress','review','done'])[i%5+1],(ARRAY['none','low','medium','high','urgent'])[i%5+1],CURRENT_DATE+(i%20-10),$2,i%17=0 FROM generate_series(1,10000) i`,
      [SCALE_MEMBER, SCALE_ADMIN],
    );
    const body = Buffer.from(
      "Synthetic scale evidence. This is not a production file.\n",
    );
    const files: Array<{ id: string; storage_path: string }> = [];
    for (let i = 5; i <= 5000; i += 5) {
      const id = randomUUID();
      const path = `evolve-files/${id}/body`;
      files.push({ id, storage_path: path });
      await db.query(
        "INSERT INTO attachment(id,entity_type,entity_id,owner_email,filename,content_type,size,storage_path,state) VALUES($1,'boardRoomProject',$2,$3,'scale-evidence.txt','text/plain',$4,$5,'ready')",
        [
          id,
          "10000000-0000-4000-8000-" + String(i).padStart(12, "0"),
          SCALE_ADMIN,
          body.length,
          path,
        ],
      );
    }
    await db.query(
      "UPDATE board_room_project SET reviewed_revision=document_revision,reviewed_by=$1,reviewed_at=now() WHERE document_revision>0 AND substring(external_id from 6)::int%10=0",
      [SCALE_ADMIN],
    );
    await db.query("COMMIT");
    await db.query("ANALYZE");
    for (let start = 0; start < files.length; start += 50)
      await Promise.all(
        files.slice(start, start + 50).map(async (file) => {
          const path = join(".data/scale-files", file.storage_path);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, body, { mode: 0o600 });
        }),
      );
    await mkdir(".data", { recursive: true });
    await writeFile(".data/scale-auth.json", JSON.stringify(auth), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        database: "evolve_perf",
        boardProjects: 5000,
        lockerProjects: 500,
        tasks: 10000,
        syntheticPrivateFiles: files.length,
        productionChanged: false,
      }),
    );
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Scale fixture preparation failed in the guarded disposable database.",
  );
  process.exitCode = 1;
});
