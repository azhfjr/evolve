"use client";
import { applyTheme } from "@/lib/theme";
import { useEffect, useLayoutEffect } from "react";
import type { AccountPreferences, WorkspaceSettings } from "@/lib/preferences";
export function useWorkspaceAppearance(
  preferences: AccountPreferences,
  settings?: WorkspaceSettings,
) {
  useEffect(() => {
    if (settings)
      document.documentElement.dataset.workspaceAccent = settings.accent;
  }, [settings]);
  useLayoutEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);
}
export function experienceAttributes(
  preferences: AccountPreferences,
  settings: WorkspaceSettings,
) {
  return {
    "data-accent": settings.accent,
    "data-density": preferences.density,
    "data-reduce-motion": preferences.reduceMotion,
    "data-font-scale": settings.configuration.fontScale,
    "data-content-width": settings.configuration.contentWidth,
  };
}
