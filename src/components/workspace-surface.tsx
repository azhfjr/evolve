"use client";
import type { ReactNode } from "react";
import type { WorkspaceExperience } from "@/lib/workspace-experience";
import {
  experienceAttributes,
  useWorkspaceAppearance,
} from "./workspace-appearance";
/** Shared appearance boundary for server-rendered portal surfaces. */
export function WorkspaceSurface({
  experience,
  children,
}: {
  experience: WorkspaceExperience;
  children: ReactNode;
}) {
  useWorkspaceAppearance(experience.profile.preferences, experience.settings);
  return (
    <div
      className="super-app"
      {...experienceAttributes(
        experience.profile.preferences,
        experience.settings,
      )}
    >
      {children}
    </div>
  );
}
