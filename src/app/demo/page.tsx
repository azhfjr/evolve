import { WorkspaceDemo } from "@/components/connected/workspace-demo";
import { Workspace } from "@/components/workspace";
export const metadata = { title: "Connected workspace demo" };
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  // Preserve explicitly addressed historical demo views and regression fixtures.
  return q.legacy === "1" || q.section ? <Workspace demo /> : <WorkspaceDemo />;
}
