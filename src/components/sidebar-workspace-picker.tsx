"use client";
import Image from "next/image";
import { ChevronsUpDown } from "lucide-react";
import type { WorkspaceSettings } from "@/lib/preferences";
export function SidebarWorkspacePicker({
  settings,
  onClick,
}: {
  settings: WorkspaceSettings;
  onClick: () => void;
}) {
  return (
    <button
      className="workspace-picker"
      aria-label={`Workspace: ${settings.name}`}
      data-sidebar-label={settings.name}
      onClick={onClick}
    >
      <span className="workspace-avatar">
        {settings.logoId ? (
          <Image
            alt=""
            src={`/api/attachments/${settings.logoId}/content`}
            width={32}
            height={32}
            unoptimized
          />
        ) : (
          settings.name.slice(0, 1)
        )}
      </span>
      <span>
        <strong>{settings.name}</strong>
        <small>{settings.description}</small>
      </span>
      <ChevronsUpDown size={14} />
    </button>
  );
}
