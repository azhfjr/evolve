import { NextResponse } from "next/server";
import { database } from "@/lib/db";
import { authConfigured } from "@/lib/auth";
import { sql } from "drizzle-orm";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  try {
    const { db } = await database();
    await db.execute(
      sql`SELECT id,due_time_zone,recurrence_anchor_day FROM task LIMIT 1`,
    );
    const schema = await db.execute(
      sql`SELECT revision,configuration FROM workspace_setting WHERE id='primary'`,
    );
    await db.execute(
      sql`SELECT version,cost_version,currency,budget,labels,cost_items,category,cost_options,planned_cod_year FROM project LIMIT 1`,
    );
    await db.execute(sql`SELECT id FROM project_expense LIMIT 1`);
    await db.execute(sql`SELECT project_id,kind FROM activity LIMIT 1`);
    const attachmentSchema = await db.execute(
      sql`SELECT name FROM evolve_migration WHERE name IN ('0010_task_draft_attachments.sql','0011_calendar_task_deletion.sql','0015_project_cost_precision.sql')`,
    );
    if (attachmentSchema.rows.length !== 3)
      throw new Error("RequiredMigrationsMissing");
    if (!schema.rows.length) throw new Error("WorkspaceSchemaRequired");
    await db.execute(
      sql`SELECT id,document_id,version_number,is_current FROM attachment LIMIT 1`,
    );
    await db.execute(sql`SELECT input_hash FROM asset_import_receipt LIMIT 1`);
    await db.execute(sql`SELECT id FROM board_asset LIMIT 1`);
    await db.execute(
      sql`SELECT published_revision,version FROM project_template_config WHERE id='primary'`,
    );
    await db.execute(sql`SELECT document_date FROM logical_document LIMIT 1`);
    if (
      !(
        await db.execute(
          sql`SELECT name FROM evolve_migration WHERE name='0041_preserve_project_template_metadata.sql'`,
        )
      ).rows.length
    )
      throw new Error("ConnectedWorkspaceSchemaRequired");
    await db.execute(
      sql`SELECT id,external_id,version,document_revision,reviewed_revision FROM board_room_project LIMIT 1`,
    );
    await db.execute(
      sql`SELECT project_id,category_id FROM board_room_assignment LIMIT 1`,
    );
    await db.execute(sql`SELECT id,name FROM board_room_category LIMIT 1`);
    await db.execute(
      sql`SELECT project_id,kind FROM board_room_history LIMIT 1`,
    );
    const boardSchema = await db.execute(
      sql`SELECT id FROM board_room_config WHERE id='primary' AND jsonb_array_length(stages)=10 AND EXISTS(SELECT 1 FROM evolve_migration WHERE name='0017_board_room.sql') AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='board_room_file_review' AND NOT tgisinternal)`,
    );
    if (!boardSchema.rows.length) throw new Error("BoardRoomSchemaRequired");
    const ready = authConfigured();
    return NextResponse.json(
      {
        status: ready ? "ready" : "configuration_required",
        database: "connected",
        schema: "current",
        authentication: ready ? "configured" : "not_configured",
      },
      { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
