"use client";
import { PROJECT_HEADERS } from "@/lib/connected/project-fields";
import { FileSpreadsheet, Layers, ListTodo } from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
export function RoomTemplates({
  room,
  onNavigate,
  templates = [],
}: {
  room: "board" | "locker";
  onNavigate: (section: string) => void;
  templates?: WorkspaceData["templates"];
}) {
  return (
    <div
      className="super-template-grid room-template-grid"
      aria-label={`${room === "board" ? "Board" : "Locker"} Room templates`}
    >
      {room === "board" ? (
        <>
          <section>
            <FileSpreadsheet size={25} />
            <span>Board Room</span>
            <h2>Project import template</h2>
            <p>
              Use all {PROJECT_HEADERS.length} supported columns. Map, preview
              and merge projects by Project ID. Link assets using their RUPTL
              codes.
            </p>
            <a href="/board-room/project-upload-template.csv" download>
              Download CSV template
            </a>
            <a href="/board-room/project-upload-example.csv" download>
              Download example projects
            </a>
            <button
              className="button secondary"
              onClick={() => onNavigate("database")}
            >
              Open project database
            </button>
          </section>
          <section>
            <Layers size={25} />
            <span>Board Room</span>
            <h2>Ten-stage workflow</h2>
            <p>Use the same ten named stages across every project.</p>
            <button
              className="button secondary"
              onClick={() => onNavigate("settings")}
            >
              View project stages
            </button>
          </section>
        </>
      ) : (
        <section>
          <ListTodo size={25} />
          <span>Locker Room</span>
          <h2>Task templates</h2>
          <p>
            Reuse descriptions, priorities and checklists from the template
            picker when creating a task.
          </p>
          {templates.map((template) => (
            <p key={template.id}>{template.name}</p>
          ))}
          <button
            className="button secondary"
            onClick={() => onNavigate("tasks")}
          >
            Open task workspace
          </button>
        </section>
      )}
    </div>
  );
}
