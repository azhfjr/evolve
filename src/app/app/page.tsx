import { database } from "@/lib/db";
import { sql } from "drizzle-orm";
import { Workspace } from "@/components/workspace";
import { currentActor } from "@/lib/current-actor";
import { loadWorkspace } from "@/lib/service";
import { authConfigured } from "@/lib/auth";
import { AppError } from "@/lib/permissions";
import { redirect } from "next/navigation";
import type { WorkspaceData } from "@/lib/types";
import { AccessNotice } from "@/components/access-notice";
export const dynamic = "force-dynamic";
export const metadata = { title: "Locker Room" };
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (!authConfigured()) return <AccessNotice reason="configuration" />;
  let data: WorkspaceData | undefined;
  let failure: unknown;
  try {
    const actor = await currentActor();
    const legacyId = params.task || params.project;
    if (legacyId) {
      const { db } = await database();
      const kind = params.task ? "task" : "project";
      if (
        (
          await db.execute(
            sql`SELECT id FROM legacy_record WHERE kind=${kind} AND id=${legacyId}`,
          )
        ).rows.length
      )
        redirect(
          `/workspace/archive?kind=${kind}&id=${encodeURIComponent(legacyId)}`,
        );
    }
    data = await loadWorkspace(actor);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    failure = e;
  }
  if (data) return <Workspace initialData={data} />;
  const e = failure;
  if (e instanceof AppError && e.status === 401) redirect("/");
  return (
    <AccessNotice
      reason={
        e instanceof AppError && e.status === 403 ? "denied" : "unavailable"
      }
      message={e instanceof AppError ? e.message : undefined}
    />
  );
}
