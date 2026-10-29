import { WorkspaceEntry } from "@/components/workspace-entry";
export const dynamic = "force-dynamic";
export const metadata = { title: "Shared settings" };
export default async function SharedSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <WorkspaceEntry view="settings" settingsTab={tab} />;
}
