import { WorkspaceEntry } from "@/components/workspace-entry";
export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace templates" };
export default function WorkspaceTemplatesPage() {
  return <WorkspaceEntry view="templates" />;
}
