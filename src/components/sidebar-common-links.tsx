"use client";
import { Activity, Files, Grid2X2, Shapes, Users } from "lucide-react";
export function SidebarCommonLinks({
  onNavigate,
  admin,
  current,
  room = "locker",
}: {
  onNavigate: (destination: string) => void;
  admin: boolean;
  current?: string;
  room?: "board" | "locker";
}) {
  return (
    <>
      <div className="nav-section-label">MANAGEMENT</div>
      {[
        { id: "people", label: "People", Icon: Users },
        { id: "activity", label: "Activity", Icon: Activity },
        ...(admin ? [{ id: "files", label: "Files", Icon: Files }] : []),
        {
          id: "templates",
          label:
            room === "board" ? "Import & Workflow Guides" : "Task Templates",
          Icon: Shapes,
        },
        { id: "home", label: "Home", Icon: Grid2X2 },
      ].map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-item shared-nav-item${current === id ? " active" : ""}`}
          aria-current={current === id ? "page" : undefined}
          aria-label={label}
          data-sidebar-label={label}
          title={label}
          onClick={() => onNavigate(id)}
        >
          <Icon size={17} />
          <span className="br-nav-label">{label}</span>
        </button>
      ))}
    </>
  );
}
