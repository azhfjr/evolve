"use client";
import { connectedRequest } from "./connected/data";
import { UnifiedSearch } from "./connected/search";
import { ProjectShortcuts } from "./connected/personal";
import { PersonalActions } from "./connected/actions";
import { useWorkspaceLive } from "./connected/live";
import { clearBrowserDrafts } from "@/lib/connected/drafts";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  FileSpreadsheet,
  Grid2X2,
  Layers,
  ListTodo,
  LogOut,
  Settings,
  Shapes,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { WorkspaceIdentity } from "./workspace-identity";
import { Logo } from "./ui";
import { WorkspaceFocusBrief } from "./workspace-focus";
import { OperationsPanel } from "./operations-panel";
import { AccountSettings } from "./account-settings";
import {
  experienceAttributes,
  useWorkspaceAppearance,
} from "./workspace-appearance";
import type { WorkspaceHomeData } from "@/lib/workspace-experience";
import type { RunCommand } from "./workspace-types";
import type { AccountProfile, WorkspaceSettings } from "@/lib/preferences";
export function WorkspaceHome({
  initialData,
  view = "home",
  settingsTab = "account",
}: {
  initialData: WorkspaceHomeData;
  view?: "home" | "settings" | "templates" | "operations";
  settingsTab?: string;
}) {
  const [data, setData] = useState(initialData),
    [error, setError] = useState(""),
    [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const liveState = useWorkspaceLive(() => {
    void connectedRequest<WorkspaceHomeData>("/api/workspace/experience")
      .then(setData)
      .catch(() => setError("Updates delayed. Retry by refreshing the page."));
  }, initialData.revision ?? 0);
  useWorkspaceAppearance(data.profile.preferences, data.settings);
  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Couldn’t sign out. Try again.");
      clearBrowserDrafts();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSigningOut(false);
    }
  }
  const run: RunCommand = async (command) => {
    const response = await fetch("/api/workspace/experience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Settings could not be saved.");
    setData((current) => ({
      ...current,
      profile: (result.profile as AccountProfile) || current.profile,
      settings: (result.settings as WorkspaceSettings) || current.settings,
      actor: result.profile
        ? { ...current.actor, name: result.profile.name }
        : current.actor,
    }));
    router.refresh();
    return result;
  };
  return (
    <div
      className="super-app"
      {...experienceAttributes(data.profile.preferences, data.settings)}
    >
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <header className="super-header">
        <Link href="/workspace" aria-label="Evolve home">
          <Logo />
        </Link>
        <nav aria-label="Workspace">
          <Link
            href="/workspace"
            aria-current={view === "home" ? "page" : undefined}
          >
            <Grid2X2 size={17} />
            <span>Home</span>
          </Link>
          <Link
            href="/workspace/templates"
            aria-current={view === "templates" ? "page" : undefined}
          >
            <Shapes size={17} />
            <span>Template Library</span>
          </Link>
          <Link
            href="/workspace/settings"
            aria-current={view === "settings" ? "page" : undefined}
          >
            <Settings size={17} />
            <span>Settings</span>
          </Link>
          {data.actor.isAdmin && (
            <Link
              href="/workspace/operations"
              aria-current={view === "operations" ? "page" : undefined}
            >
              <ChartNoAxesCombined size={17} />
              <span>Operations</span>
            </Link>
          )}
          <button
            onClick={() => void signOut()}
            disabled={signingOut}
            aria-label="Sign out"
          >
            <LogOut size={17} />
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </nav>
      </header>
      <div className="super-content">
        <UnifiedSearch />
        <small role="status">{liveState}</small>
      </div>
      <main id="workspace-content" className="super-content">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {view === "home" && (
          <>
            <div
              className={`super-intro${data.focus ? " super-intro-focus" : ""}`}
            >
              <div className="super-workspace-name">
                <WorkspaceIdentity settings={data.settings} />
              </div>
              <h1>
                Make room for
                <br />
                what’s next.
              </h1>
              <p>
                Welcome back, {data.actor.name}. Pick up the work that matters.
              </p>
            </div>
            <ProjectShortcuts />
            <PersonalActions />
            <p>
              <Link href="/workspace/archive">Legacy Locker archive</Link>
            </p>
            {data.focus && (
              <WorkspaceFocusBrief
                focus={data.focus}
                email={data.actor.email}
              />
            )}
            <div className="room-home-grid">
              <Link href="/board-room" className="room-home-card board-card">
                <div className="room-card-heading">
                  <span className="room-card-icon">
                    <ChartNoAxesCombined size={26} />
                  </span>
                  <span>Project monitoring</span>
                  <ArrowUpRight size={22} />
                </div>
                <h2>Board Room</h2>
                <p>
                  The bigger picture, brought into focus.
                  <br />
                  Follow each project from first step to operation.
                </p>
                <div className="room-art board-art" aria-hidden="true">
                  <div className="room-art-years">
                    <span>Plan</span>
                    <span>Build</span>
                    <span>Operate</span>
                  </div>
                  <div className="room-art-track">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="room-art-bars">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <div className="room-card-stats">
                  <span>
                    <strong>
                      {data.totals.boardProjects.toLocaleString("en")}
                    </strong>{" "}
                    monitored projects
                  </span>
                  <span>
                    <strong>10</strong> shared stages
                  </span>
                </div>
                <div className="room-card-enter">
                  Enter Board Room
                  <ArrowRight size={18} />
                </div>
              </Link>
              <Link href="/app" className="room-home-card locker-card">
                <div className="room-card-heading">
                  <span className="room-card-icon">
                    <ListTodo size={26} />
                  </span>
                  <span>Task management</span>
                  <ArrowUpRight size={22} />
                </div>
                <h2>Locker Room</h2>
                <p>
                  The work that moves projects forward.
                  <br />
                  Plan, assign and collaborate with your team.
                </p>
                <div className="room-art locker-art" aria-hidden="true">
                  <div>
                    <span>
                      <Check size={14} />
                      Scope confirmed
                    </span>
                    <i>Done</i>
                  </div>
                  <div>
                    <span>
                      <span className="room-art-dot" />
                      Coordinate the next step
                    </span>
                    <i>In progress</i>
                  </div>
                  <div>
                    <span>
                      <span className="room-art-dot" />
                      Bring the team together
                    </span>
                    <i>Planned</i>
                  </div>
                </div>
                <div className="room-card-stats">
                  <span>
                    <strong>{data.totals.tasks.toLocaleString("en")}</strong>{" "}
                    active tasks
                  </span>
                  <span>
                    <strong>
                      {data.totals.lockerProjects.toLocaleString("en")}
                    </strong>{" "}
                    projects
                  </span>
                </div>
                <div className="room-card-enter">
                  Enter Locker Room
                  <ArrowRight size={18} />
                </div>
              </Link>
            </div>
            <div className="super-continuity">
              <Layers size={19} />
              <div>
                <strong>One account. A connected workspace.</strong>
                <p>
                  Your appearance, profile and access follow you between rooms.
                </p>
              </div>
              <Link href="/workspace/settings">
                Personalize your workspace
                <ArrowRight size={16} />
              </Link>
            </div>
          </>
        )}
        {view === "operations" && data.actor.isAdmin && (
          <>
            <div className="super-page-heading">
              <Link href="/workspace">Home</Link>
              <h1>Operations readiness</h1>
              <p>
                Maintenance signals and admin-reported recovery evidence for the
                shared workspace.
              </p>
            </div>
            <OperationsPanel />
          </>
        )}
        {view === "settings" && (
          <>
            <div className="super-page-heading">
              <Link href="/workspace">Home</Link>
              <h1>Shared settings</h1>
              <p>
                Your account, appearance and workspace settings apply to Locker
                Room and Board Room.
              </p>
            </div>
            <AccountSettings
              initialTab={settingsTab}
              sharedFiles
              data={data}
              run={run}
              demo={false}
              onExport={() => {
                const link = document.createElement("a");
                link.href = "/api/tasks/export";
                link.download = "evolve-tasks.csv";
                link.click();
              }}
              onLogout={() => void signOut()}
            />
          </>
        )}
        {view === "templates" && (
          <>
            <div className="super-page-heading">
              <Link href="/workspace">Home</Link>
              <h1>A head start for every room.</h1>
              <p>
                Use the right starting point for the work ahead. Both rooms
                share your workspace design and settings.
              </p>
            </div>
            <div className="super-template-grid">
              <section>
                <ListTodo size={25} />
                <span>Locker Room</span>
                <h2>Task templates</h2>
                <p>
                  Reuse task descriptions, priorities and checklists when
                  creating work.
                </p>
                <Link href="/app?section=tasks">
                  Open task workspace
                  <ArrowRight size={16} />
                </Link>
              </section>
              <section>
                <FileSpreadsheet size={25} />
                <span>Board Room</span>
                <h2>Project import template</h2>
                <p>
                  Start with the supported project fields, then map and preview
                  your CSV before merging.
                </p>
                <a href="/board-room/project-upload-template.csv" download>
                  Download CSV template
                  <ArrowRight size={16} />
                </a>
                <a href="/board-room/project-upload-example.csv" download>
                  Download example projects
                  <ArrowUpRight size={15} />
                </a>
              </section>
              <section>
                <Layers size={25} />
                <span>Board Room</span>
                <h2>Ten-stage workflow</h2>
                <p>
                  One admin-defined sequence keeps project progress comparable
                  across the portfolio.
                </p>
                <Link href="/board-room?section=settings">
                  {data.actor.isAdmin
                    ? "Configure project stages"
                    : "View project stages"}
                  <ArrowRight size={16} />
                </Link>
              </section>
            </div>
          </>
        )}
      </main>
      <footer className="super-footer">
        <span>Evolve · {data.settings.name}</span>
        <span>
          {data.actor.isAdmin ? "Workspace administrator" : "Workspace member"}{" "}
          · {data.actor.email}
        </span>
      </footer>
    </div>
  );
}
