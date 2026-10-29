"use client";
import { useTemplateNavigation } from "./template-recovery";
import { clearBrowserDrafts } from "@/lib/connected/drafts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SidebarFooter } from "../sidebar-footer";
import { SidebarCommonLinks } from "../sidebar-common-links";
import { SidebarHints } from "../sidebar-hints";
import { SidebarNavigation } from "../sidebar-navigation";
import { Logo, Modal } from "../ui";
import { applyTheme, type ThemePreference } from "@/lib/theme";
import { clearTaskDrafts } from "@/lib/task-composer";
import { clearProjectDrafts } from "@/lib/project-composer";
import type { Actor } from "@/lib/types";
import type { AccountProfile } from "@/lib/preferences";
import { RoomSwitcher } from "../room-switcher";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from "lucide-react";

export function BoardNavigation({
  sections,
  section,
  onNavigate,
  actor,
  profile,
  onProfileChanged,
  onQuickFind,
  onNewProject,
  admin,
  total,
  collapsed,
  onCollapse,
  saving = false,
}: {
  sections: { id: string; label: string; icon: LucideIcon }[];
  section: string;
  onNavigate: (id: string) => void;
  actor: Actor;
  profile: AccountProfile;
  onProfileChanged: (profile: AccountProfile) => void;
  onQuickFind: () => void;
  onNewProject: () => void;
  admin: boolean;
  total: number;
  collapsed: boolean;
  onCollapse: () => void;
  saving?: boolean;
}) {
  const templateNavigation = useTemplateNavigation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const closeOnDesktop = () => {
      if (!media.matches) setOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  const [shortcuts, setShortcuts] = useState(false);
  const [themePending, setThemePending] = useState<ThemePreference | null>(
    null,
  );
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const theme = themePending ?? profile.preferences.theme;
  function sharedNavigate(destination: string) {
    if (destination === "home") {
      setOpen(false);
      templateNavigation.navigate(() => router.push("/workspace"));
    } else navigate(destination);
  }
  async function changeTheme(value: ThemePreference) {
    if (themePending || saving) return;
    setThemePending(value);
    applyTheme(value);
    try {
      const { version, ...fields } = profile;
      const response = await fetch("/api/workspace/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateProfile",
          version,
          ...fields,
          preferences: { ...fields.preferences, theme: value },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      onProfileChanged(body.profile);
    } catch (e) {
      applyTheme(profile.preferences.theme);
      toast.error((e as Error).message);
    } finally {
      setThemePending(null);
    }
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw Error("Couldn’t sign out. Please try again.");
      clearBrowserDrafts();
      clearTaskDrafts(actor.email, false);
      clearProjectDrafts(actor.email, false);
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setSigningOut(false);
    }
  }
  function navigate(id: string) {
    onNavigate(id);
    setOpen(false);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.defaultPrevented ||
        document.querySelector(
          '[role="dialog"], [role="listbox"], [role="menu"]',
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        onQuickFind();
      } else if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
        return;
      else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key === "?"
      )
        setShortcuts(true);
      else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === "n" &&
        admin
      )
        onNewProject();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onQuickFind, onNewProject, admin]);
  const content = (drawer = false) => (
    <>
      <div className="br-sidebar-brand">
        <Link
          className="br-brand"
          href="/board-room"
          aria-label="Board Room overview"
        >
          <Logo name="Board Room" />
        </Link>
        {drawer ? (
          <Dialog.Close
            className="br-sidebar-toggle"
            aria-label="Close navigation"
          >
            <X size={18} />
          </Dialog.Close>
        ) : (
          <button
            className="br-sidebar-toggle"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={onCollapse}
            disabled={saving}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        )}
      </div>
      <RoomSwitcher email={actor.email} room="board" />

      <button
        className="sidebar-search"
        aria-label="Quick find"
        aria-keyshortcuts="Control+f Meta+f"
        title="Quick find · Ctrl+F"
        onClick={() => {
          setOpen(false);
          onQuickFind();
        }}
      >
        <Search size={15} />
        <span>Quick find</span>
        <kbd>Ctrl F</kbd>
      </button>
      <SidebarNavigation page={section}>
        <div className="nav-section-label">BOARD ROOM</div>

        {sections.map((s) => (
          <button
            key={s.id}
            className={`nav-item${section === s.id ? " active" : ""}`}
            aria-current={section === s.id ? "page" : undefined}
            aria-label={s.label}
            title={s.label}
            onClick={() => navigate(s.id)}
          >
            <s.icon size={17} />
            <span className="br-nav-label">{s.label}</span>
            {s.id === "projects" && <small>{total}</small>}
          </button>
        ))}
        <SidebarCommonLinks
          room="board"
          current={section}
          admin={admin}
          onNavigate={sharedNavigate}
        />
      </SidebarNavigation>
      <SidebarFooter
        actor={actor}
        theme={theme}
        disabled={saving || themePending !== null || signingOut}
        onTheme={(value) => void changeTheme(value)}
        onSettings={() => {
          setOpen(false);
          navigate("preferences");
        }}
        onShortcuts={() => setShortcuts(true)}
        onLogout={() => void signOut()}
      />
    </>
  );
  return (
    <>
      {shortcuts && (
        <Modal
          open
          title="A little more in flow"
          description="Your shortcuts to a calmer workday."
          onClose={() => setShortcuts(false)}
        >
          <div className="shortcuts">
            <div>
              <span>Find a project</span>
              <span>
                <kbd>Ctrl</kbd>
                <kbd>F</kbd>
              </span>
            </div>
            <div>
              <span>Create a project</span>
              <kbd>N</kbd>
            </div>
            <div>
              <span>Keyboard shortcuts</span>
              <kbd>?</kbd>
            </div>
            <div>
              <span>Close a dialog</span>
              <kbd>Esc</kbd>
            </div>
            <p className="muted small">
              Select a project to explore its details. Administrators can click
              stages to update progress and use Undo.
            </p>
          </div>
        </Modal>
      )}
      <aside className="br-sidebar br-desktop-sidebar">
        {content()}
        {collapsed && <SidebarHints selector=".br-desktop-sidebar" />}
      </aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="br-tablet-rail">
          <Dialog.Trigger className="br-rail-menu" aria-label="Open navigation">
            <Menu size={20} />
          </Dialog.Trigger>
          <nav aria-label="Board Room shortcuts">
            {sections.map((s) => (
              <button
                key={s.id}
                aria-label={s.label}
                aria-current={section === s.id ? "page" : undefined}
                className={`nav-item${section === s.id ? " active" : ""}`}
                title={s.label}
                onClick={() => navigate(s.id)}
              >
                <s.icon size={19} />
              </button>
            ))}
          </nav>
        </div>
        <div className="br-mobile-header">
          <Dialog.Trigger aria-label="Open navigation">
            <Menu size={20} />
          </Dialog.Trigger>
          <Link
            className="br-brand"
            href="/board-room"
            aria-label="Board Room overview"
          >
            <Logo name="Board Room" />
          </Link>
          <span>Board Room</span>
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="br-navigation-overlay" />
          <Dialog.Content
            className="br br-sidebar br-navigation-drawer"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const trigger = document.querySelector<HTMLButtonElement>(
                window.innerWidth > 1100
                  ? ".br-desktop-sidebar .br-sidebar-toggle"
                  : window.innerWidth <= 640
                    ? ".br-mobile-header button"
                    : ".br-rail-menu",
              );
              trigger?.focus();
            }}
          >
            <Dialog.Title className="br-sr-only">
              Board Room navigation
            </Dialog.Title>
            <Dialog.Description className="br-sr-only">
              Browse projects, documents, reports and administration.
            </Dialog.Description>
            {content(true)}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
