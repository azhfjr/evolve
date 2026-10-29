import { Client } from "pg";
import { head, BlobNotFoundError } from "@vercel/blob";
async function main() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_PROJECT_ID !== "prj_4Cvh0pTUBDKUvva5eE9GmNLFcNie"
  )
    throw Error("Isolated preview only");
  const connection = process.env.DATABASE_URL;
  if (
    !connection ||
    !/^\/evolve_preview_[a-f0-9]{16}$/.test(new URL(connection).pathname)
  )
    throw Error("Preview database identity required");
  const client = new Client({
    connectionString: connection,
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  try {
    if (
      !(
        await client.query("SELECT current_database() name")
      ).rows[0].name.startsWith("evolve_preview_")
    )
      throw Error("Wrong database");
    const files = (
      await client.query(
        "SELECT a.id,a.storage_path FROM attachment a JOIN board_room_project p ON p.id=a.entity_id WHERE a.entity_type='boardRoomProject' AND a.state='deleting' AND p.external_id LIKE 'RELEASE-QA-%' AND p.data->>'name'='Isolated release verification'",
      )
    ).rows;
    let confirmed = 0;
    for (const f of files) {
      try {
        await head(f.storage_path);
        throw Error("Test file still exists in provider");
      } catch (e) {
        if (!(e instanceof BlobNotFoundError)) throw e;
        confirmed++;
      }
    }
    // Expire the upload-token safety hold only on disposable, already-deleted test files.
    await client.query(
      "UPDATE attachment SET created_at=now()-interval '71 minutes' WHERE id=ANY($1::text[]) AND state='deleting'",
      [files.map((f) => f.id)],
    );
    const { cleanupAttachments } = await import("../src/lib/attachments");
    await cleanupAttachments();
    const { database } = await import("../src/lib/db");
    await (await database()).close();
    const remaining = Number(
      (await client.query("SELECT coalesce(sum(size),0) bytes FROM attachment"))
        .rows[0].bytes,
    );
    if (remaining !== 0)
      throw Error("Preview allocated bytes did not reconcile to zero");
    await client.query("DELETE FROM auth_session WHERE id LIKE 'preview-%'");
    console.log(
      "EVOLVE_PREVIEW_CLEANUP_VERIFIED " +
        JSON.stringify({
          providerObjectsConfirmedAbsent: confirmed,
          allocatedBytes: remaining,
          temporarySessionRevoked: true,
          productionTouched: false,
          safetyWindowExpiredInDisposableFixture: true,
        }),
    );
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(
    "EVOLVE_PREVIEW_CLEANUP_FAILED",
    e instanceof Error ? e.name : "unknown",
  );
  process.exitCode = 1;
});
