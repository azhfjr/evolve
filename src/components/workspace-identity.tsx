import Image from "next/image";
import type { WorkspaceSettings } from "@/lib/preferences";
export function WorkspaceIdentity({
  settings,
}: {
  settings: Pick<WorkspaceSettings, "name" | "logoId">;
}) {
  return (
    <span className="workspace-identity">
      <span className="workspace-identity-mark">
        {settings.logoId ? (
          <Image
            src={`/api/attachments/${settings.logoId}/content`}
            width={28}
            height={28}
            alt=""
            unoptimized
          />
        ) : (
          settings.name.slice(0, 1)
        )}
      </span>
      <span className="workspace-identity-name">{settings.name}</span>
    </span>
  );
}
