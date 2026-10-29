import { WorkspaceEntry } from "@/components/workspace-entry";
export const dynamic = "force-dynamic";
export const metadata = { title: "Operations readiness" };
export default function OperationsPage() {
  return <WorkspaceEntry view="operations" />;
}
