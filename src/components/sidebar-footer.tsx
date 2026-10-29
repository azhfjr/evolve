"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Check,
  Moon,
  Sun,
  Monitor,
  Settings,
  CircleHelp,
  ChevronsUpDown,
  LogOut,
} from "lucide-react";
import { Avatar } from "./ui";
import { useI18n } from "./i18n-provider";
import type { Actor } from "@/lib/types";
import type { ThemePreference } from "@/lib/theme";
export function SidebarFooter({
  actor,
  theme,
  disabled = false,
  demo = false,
  onTheme,
  onSettings,
  onShortcuts,
  onLogout,
}: {
  actor: Actor;
  theme: ThemePreference;
  disabled?: boolean;
  demo?: boolean;
  onTheme: (theme: ThemePreference) => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="sidebar-bottom">
      <div className="sidebar-note">
        <span className="note-spark">✳</span>
        <strong>
          {t("A little more focused.")}
          <br />
          {t("A lot more possible.")}
        </strong>
        <span>{t("Small steps make great things.")}</span>
      </div>
      <div className="sidebar-utility">
        <Dropdown.Root>
          <Dropdown.Trigger aria-label="Theme" data-sidebar-label="Theme">
            {theme === "dark" ? (
              <Moon size={15} />
            ) : theme === "light" ? (
              <Sun size={15} />
            ) : (
              <Monitor size={15} />
            )}
            <span>{t("Theme")}</span>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              className="dropdown-menu theme-menu"
              side="top"
              sideOffset={8}
            >
              <Dropdown.Label>{t("Theme")}</Dropdown.Label>
              <Dropdown.RadioGroup
                value={theme}
                onValueChange={(value) =>
                  void onTheme(value as ThemePreference)
                }
              >
                {(["light", "dark", "system"] as const).map((value) => (
                  <Dropdown.RadioItem
                    key={value}
                    value={value}
                    disabled={disabled}
                  >
                    {value === "light" ? (
                      <Sun size={15} />
                    ) : value === "dark" ? (
                      <Moon size={15} />
                    ) : (
                      <Monitor size={15} />
                    )}
                    {t(
                      value === "light"
                        ? "Light"
                        : value === "dark"
                          ? "Dark"
                          : "System",
                    )}
                    <Dropdown.ItemIndicator>
                      <Check size={14} />
                    </Dropdown.ItemIndicator>
                  </Dropdown.RadioItem>
                ))}
              </Dropdown.RadioGroup>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>

        <button
          aria-label="Settings"
          data-sidebar-label="Settings"
          onClick={onSettings}
        >
          <Settings size={15} />
          <span>{t("Settings")}</span>
        </button>
        <button
          className="icon-button"
          data-sidebar-label="Keyboard shortcuts"
          aria-label={t("Keyboard shortcuts")}
          onClick={onShortcuts}
        >
          <CircleHelp size={16} />
        </button>
      </div>
      <Dropdown.Root>
        <Dropdown.Trigger
          className="profile-button"
          aria-label={`${actor.name} · ${actor.isAdmin ? "Workspace admin" : "Team member"}`}
          data-sidebar-label={actor.name}
        >
          <Avatar name={actor.name} image={actor.image} />
          <span>
            <strong>{actor.name}</strong>
            <small>
              {actor.isAdmin ? t("Workspace admin") : t("Team member")}
            </small>
          </span>
          <ChevronsUpDown size={13} />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            className="dropdown-menu profile-menu"
            side="top"
            sideOffset={8}
          >
            <Dropdown.Label>{actor.email}</Dropdown.Label>
            <Dropdown.Item onSelect={onSettings}>
              <Settings size={15} />
              {t("Settings")}
            </Dropdown.Item>
            <Dropdown.Separator />
            <Dropdown.Item onSelect={onLogout}>
              <LogOut size={15} />
              {demo ? t("Leave demo") : t("Sign out")}
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
