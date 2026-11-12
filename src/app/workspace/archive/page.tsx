import { WorkspaceSurface } from "@/components/workspace-surface";
import { database } from "@/lib/db";
import {
  readWorkspaceExperience,
  type WorkspaceExperience,
} from "@/lib/workspace-experience";
import { currentActor } from "@/lib/current-actor";
import { LegacyArchive } from "@/components/connected/archive";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/permissions";
import { AccessNotice } from "@/components/access-notice";
export const dynamic = "force-dynamic";
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let experience: WorkspaceExperience;
  try {
    const actor = await currentActor();
    experience = await readWorkspaceExperience((await database()).db, actor);
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect("/");
    return <AccessNotice reason="denied" />;
  }
  const p = await searchParams;
  return (
    <WorkspaceSurface experience={experience}>
      <main className="super-content">
        <LegacyArchive
          key={`${p.kind ?? "project"}:${p.id ?? "list"}`}
          initialKind={p.kind === "task" ? "task" : "project"}
          id={p.id}
        />
      </main>
    </WorkspaceSurface>
  );
}
