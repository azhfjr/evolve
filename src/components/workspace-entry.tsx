import { redirect } from "next/navigation";
import { currentActor } from "@/lib/current-actor";
import { authConfigured } from "@/lib/auth";
import { AppError, requireAdmin } from "@/lib/permissions";
import {
  loadWorkspaceHome,
  type WorkspaceHomeData,
} from "@/lib/workspace-experience";
import { AccessNotice } from "./access-notice";
import { WorkspaceHome } from "./workspace-home";
export async function WorkspaceEntry({
  view = "home",
  settingsTab,
}: {
  view?: "home" | "settings" | "templates" | "operations";
  settingsTab?: string;
}) {
  if (!authConfigured()) return <AccessNotice reason="configuration" />;
  let data: WorkspaceHomeData | undefined, failure: unknown;
  try {
    const actor = await currentActor();
    if (view === "operations") requireAdmin(actor);
    data = await loadWorkspaceHome(actor);
  } catch (error) {
    failure = error;
  }
  if (data)
    return (
      <WorkspaceHome initialData={data} view={view} settingsTab={settingsTab} />
    );
  if (failure instanceof AppError && failure.status === 401) redirect("/");
  return (
    <AccessNotice
      reason={
        failure instanceof AppError && failure.status === 403
          ? "denied"
          : "unavailable"
      }
      message={failure instanceof AppError ? failure.message : undefined}
    />
  );
}
