"use client";
import { CanonicalProjectDocuments } from "./connected/canonical-project-documents";
import { RelatedRoomProjects } from "./related-room-projects";
import { applyTheme, type ThemePreference } from "@/lib/theme";
import { clearProjectDrafts } from "@/lib/project-composer";
import { AppSelect } from "./app-select";
import { RoomTemplates } from "./room-templates";
import { SidebarCommonLinks } from "./sidebar-common-links";
import { SidebarFooter } from "./sidebar-footer";
import { RoomSwitcher } from "./room-switcher";
import { SidebarHints } from "./sidebar-hints";
import {
  DeleteEntityDialog,
  type DeletionTarget,
} from "./delete-entity-dialog";
import { SidebarNavigation } from "./sidebar-navigation";
import { Connections } from "./connections";
import type { ConnectionEntity } from "@/lib/connection-model";
import { matchesTaskSearch } from "@/lib/project-labels";
import { labelKey, displayLabel } from "@/lib/labels";
import { eventMessage } from "@/lib/i18n/events";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  GitBranch,
  Tag,
  Trash2,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  List,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  WifiOff,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import clsx from "clsx";
import type { Member, Project, Task, WorkspaceData, Status } from "@/lib/types";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
} from "@/lib/types";
import type { Command } from "@/lib/validation";
import { apiCommand } from "@/lib/client-store";
import { demoCommand, getSavedDemo, saveDemo } from "@/lib/client-store";
import { createDemo } from "@/lib/demo";
import {
  clearTaskDrafts,
  taskDefaultSchema,
  type TaskDefaults,
} from "@/lib/task-composer";
import { csvExport } from "@/lib/utils";
import { Avatar, Empty, Logo, Modal, Spinner } from "./ui";
import { Dashboard } from "./dashboard";
import { LiveClock } from "./live-clock";
import { AppFooter } from "./app-footer";
import { ProjectPortfolio, ProjectFinance } from "./project-finance";
import { SavedViews } from "./saved-views";

import { TaskList, TaskBoard, TaskCalendar, calendarToday } from "./task-views";
import type { TaskEditorHandle } from "./task-editor";
import { ProjectDialog, InviteDialog } from "./project-dialog";
import { SearchDialog } from "./search-dialog";
import { AccountSettings, EditMemberDialog } from "./account-settings";
import { useRememberedWorkspace } from "./connected/personal";
import { clearBrowserDrafts } from "@/lib/connected/drafts";
import { Attachments } from "./attachments";
import { defaultProfile } from "@/lib/preferences";
import type { AccountProfile, WorkspaceSettings } from "@/lib/preferences";
import { BulkTaskDialog, ImportTaskDialog } from "./batch-tasks";
import { I18nProvider, useI18n } from "./i18n-provider";

function SurfaceLoading() {
  return (
    <div className="surface-loading" role="status">
      <Spinner />
      Loading workspace…
    </div>
  );
}
const TaskEditor = dynamic(
  () => import("./task-editor").then((module) => module.TaskEditor),
  { loading: SurfaceLoading },
);
const ActivityManagement = dynamic(
  () => import("./management").then((module) => module.ActivityManagement),
  { loading: SurfaceLoading },
);
const PeopleManagement = dynamic(
  () => import("./management").then((module) => module.PeopleManagement),
  { loading: SurfaceLoading },
);

type Page =
  | "dashboard"
  | "projects"
  | "connection"
  | "tasks"
  | "mytasks"
  | "inbox"
  | "team"
  | "activity"
  | "archive"
  | "settings"
  | "templates"
  | "files"
  | "project";
type View = "list" | "board" | "calendar";
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 1100px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function mobileSnapshot() {
  return window.matchMedia("(max-width: 1100px)").matches;
}
export function Workspace(props: {
  initialData?: WorkspaceData;
  demo?: boolean;
}) {
  const parent = useI18n();
  return (
    <I18nProvider initialLocale={"en"} onChange={parent.setLocale}>
      <WorkspaceContent {...props} />
    </I18nProvider>
  );
}
function WorkspaceContent({
  initialData,
  demo = false,
}: {
  initialData?: WorkspaceData;
  demo?: boolean;
}) {
  const { locale, t, formatDate, relativeTime } = useI18n();
  const initialLocaleRef = useRef(locale);
  const router = useRouter();
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  const [data, setData] = useState<WorkspaceData | null>(initialData || null);
  useRememberedWorkspace(data?.actor.email ?? "anonymous", "locker");
  const [collapsePending, setCollapsePending] = useState<boolean | null>(null);
  const sidebarCollapsed =
    collapsePending ?? data?.profile?.preferences.sidebarCollapsed ?? false;
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const [page, setPage] = useState<Page>("dashboard");
  const [connectionLabel, setConnectionLabel] = useState("");
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [view, setView] = useState<View>("list");
  const [projectId, setProjectId] = useState<string>();
  const documentTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const documentTarget = documentTargetRef.current;
    if (
      documentTarget &&
      page === "project" &&
      projectId === documentTarget &&
      data?.projects.some((p) => p.id === documentTarget)
    ) {
      const section = document.getElementById("project-documents");
      if (section) {
        section.scrollIntoView({ block: "center" });
        section.focus({ preventScroll: true });
        documentTargetRef.current = null;
      }
    }
  }, [page, projectId, data]);
  const [taskOpen, setTaskOpen] = useState(false);
  const taskHistoryPushed = useRef(false);
  const taskEditorRef = useRef<TaskEditorHandle>(null);
  const locationRef = useRef<{ index: number; url: string } | null>(null);
  const approvedPopRef = useRef(false);
  const historyTravelRef = useRef<{
    phase: "restore" | "waiting" | "proceed";
    delta: number;
    approved: boolean;
    busy: boolean;
  } | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<TaskDefaults>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  const [projectOpen, setProjectOpenState] = useState(false);
  const setProjectOpen = useCallback(
    (open: boolean) => {
      if (open && dataRef.current?.canonicalProjects)
        router.push("/board-room?section=projects");
      else setProjectOpenState(open);
    },
    [router],
  );
  const [projectCostsOnly, setProjectCostsOnly] = useState(false);
  const [editProject, setEditProject] = useState<Project>();
  const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(
    null,
  );
  const deletionReturnFocus = useRef<HTMLElement | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [batchDialog, setBatchDialog] = useState<"bulk" | "import" | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dueBucket, setDueBucket] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateMode, setDateMode] = useState<"due" | "overlap">("due");
  const [sort, setSort] = useState("updated");
  const [selectedCalendarMonth, setCalendarMonth] = useState<Date>();
  const [selectedCalendarDate, setCalendarSelectedDate] = useState<Date>();
  const accountCalendarDate = calendarToday(
    data?.profile?.timeZone || data?.settings?.timeZone || "Asia/Jakarta",
  );
  const calendarMonth = selectedCalendarMonth || accountCalendarDate;
  const [serverPage, setServerPage] = useState<{
    signature: string;
    tasks: Task[];
    nextCursor: string | null;
    total: number;
  } | null>(null);
  const serverPageRef = useRef(serverPage);
  const [queryLoading, setQueryLoading] = useState(false);
  const [taskQueryRevision, setTaskQueryRevision] = useState(0);
  const mutationRef = useRef(false);
  const generationRef = useRef(0);

  const [queryError, setQueryError] = useState("");
  const taskRoute = ["tasks", "mytasks", "project", "archive"].includes(page);
  const queryParameters = useMemo(() => {
    const params = new URLSearchParams({
      sort,
      archived: page === "archive" ? "true" : "false",
      limit: "200",
    });
    if (query) params.set("q", query);
    if (dueBucket) params.set("dueBucket", dueBucket);
    if (statusFilter) params.set("status", statusFilter);
    if (openOnly) params.set("open", "true");
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (dateMode === "overlap" && (dateFrom || dateTo))
      params.set("dateMode", "overlap");
    if (priorityFilter) params.set("priority", priorityFilter);
    if (assigneeFilter) params.set("assignee", assigneeFilter);
    if (page === "mytasks") params.set("mine", "true");
    if (page === "project" && projectId) params.set("projectId", projectId);
    if (view === "calendar" && page !== "archive") {
      params.set("dateMode", "overlap");
      params.set(
        "from",
        formatDate(
          startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        ),
      );
      params.set(
        "to",
        formatDate(
          endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        ),
      );
    }
    return params.toString();
  }, [
    sort,
    page,
    query,
    statusFilter,
    dueBucket,
    openOnly,
    priorityFilter,
    assigneeFilter,
    projectId,
    view,
    calendarMonth,
    dateFrom,
    dateTo,
    dateMode,
    formatDate,
  ]);
  useEffect(() => {
    if (demo || !taskRoute) return;
    const abort = new AbortController();
    const timer = setTimeout(
      async () => {
        const generation = generationRef.current;
        setQueryLoading(true);
        setQueryError("");
        try {
          const url = new URLSearchParams(queryParameters);
          const previous = serverPageRef.current;
          const desired =
            previous?.signature === queryParameters ? previous.tasks.length : 0;
          let response = await fetch(`/api/tasks?${url}`, {
            signal: abort.signal,
            cache: "no-store",
          });
          let result = await response.json();
          if (!response.ok) throw new Error(result.error);
          const tasks: Task[] = [...result.tasks];
          while (result.nextCursor && tasks.length < desired) {
            url.set("cursor", result.nextCursor);
            response = await fetch(`/api/tasks?${url}`, {
              signal: abort.signal,
              cache: "no-store",
            });
            result = await response.json();
            if (!response.ok) throw new Error(result.error);
            tasks.push(...result.tasks);
          }
          if (
            !abort.signal.aborted &&
            generation === generationRef.current &&
            !mutationRef.current
          ) {
            const next = {
              signature: queryParameters,
              tasks,
              nextCursor: result.nextCursor,
              total: result.total,
            };
            serverPageRef.current = next;
            setServerPage(next);
          }
        } catch (e) {
          if (!abort.signal.aborted) setQueryError((e as Error).message);
        } finally {
          if (!abort.signal.aborted) setQueryLoading(false);
        }
      },
      query ? 180 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    demo,
    taskRoute,
    queryParameters,
    data?.revision,
    query,
    taskQueryRevision,
  ]);
  const [busy, setBusy] = useState(false);
  const refreshRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const refreshFunctionRef = useRef<
    ((silent?: boolean) => Promise<void>) | null
  >(null);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [themePending, setThemePending] = useState<ThemePreference | null>(
    null,
  );
  const theme = themePending ?? data?.profile?.preferences.theme ?? "system";
  useEffect(() => {
    document.documentElement.dataset.workspaceAccent =
      data?.settings?.accent || "green";
  }, [data?.settings?.accent]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [liveState, setLiveState] = useState("connecting");
  const hasThemeProfile = Boolean(data);
  useLayoutEffect(() => {
    if (hasThemeProfile) applyTheme(theme);
  }, [theme, hasThemeProfile]);
  useEffect(() => {
    if (demo) {
      const saved = getSavedDemo() || createDemo();
      if (!saved.profile)
        saved.profile = {
          ...defaultProfile(saved.actor.name),
          preferences: {
            ...defaultProfile(saved.actor.name).preferences,
            locale: initialLocaleRef.current,
          },
        };
      saved.profile.preferences.locale = initialLocaleRef.current;
      saveDemo(saved);
      // Demo browser storage is intentionally read after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(saved);
    }
    const network = () => setOffline(!navigator.onLine);
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, [demo]);
  const refresh = useCallback(
    async (silent = false): Promise<void> => {
      if (demo) return;
      if (refreshRef.current || mutationRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      pendingRefreshRef.current = false;
      refreshRef.current = true;
      const generation = generationRef.current;
      if (!silent) setSyncing(true);
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || t("Couldn’t refresh the workspace."));
        const next = result as WorkspaceData;
        while (
          next.nextCursor &&
          next.tasks.length < (dataRef.current?.tasks.length || 0)
        ) {
          const r = await fetch(`/api/workspace?cursor=${next.nextCursor}`);
          if (!r.ok) throw new Error(t("Couldn’t load more tasks."));
          const p = await r.json();
          next.tasks.push(...p.tasks);
          next.nextCursor = p.nextCursor;
        }
        if (!mutationRef.current && generation === generationRef.current)
          setData(next);
        setSyncError(false);
      } catch (e) {
        setSyncError(true);
        if (!silent) toast.error((e as Error).message);
      } finally {
        refreshRef.current = false;
        setSyncing(false);
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          queueMicrotask(() => void refreshFunctionRef.current?.(true));
        }
      }
    },
    [demo, t],
  );
  useEffect(() => {
    refreshFunctionRef.current = refresh;
    return () => {
      refreshFunctionRef.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    if (demo) return;
    const events = new EventSource(
      `/api/events?since=${dataRef.current?.revision || 0}`,
    );
    events.addEventListener("ready", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      setLiveState(payload.transport === "postgres" ? "live" : "fallback");
    });
    events.addEventListener("workspace", () => void refresh(true));
    events.addEventListener("degraded", () => setLiveState("fallback"));
    events.addEventListener("revoked", () => {
      events.close();
      router.refresh();
    });
    events.onerror = () => setLiveState("reconnecting");
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 45000);
    const focused = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", focused);
    return () => {
      clearInterval(interval);
      events.close();
      document.removeEventListener("visibilitychange", focused);
    };
  }, [demo, refresh, router]);
  const run = useCallback(
    async (command: Command) => {
      if (mutationRef.current)
        throw new Error(
          t("A change is still saving. Please try again in a moment."),
        );
      if (!dataRef.current) throw new Error(t("Workspace is still loading."));
      mutationRef.current = true;
      generationRef.current += 1;
      setBusy(true);
      try {
        if (demo) {
          const next = demoCommand(dataRef.current, command);
          dataRef.current = next.data;
          setData(next.data);
          return next.result;
        }
        const result = await apiCommand(command);
        const changed = [
          ...((result.tasks as Task[]) || []),
          ...(result.task ? [result.task as Task] : []),
        ];
        if (changed.length || result.deletedTaskId || result.deletedProjectId) {
          setServerPage((previous) => {
            if (!previous) return previous;
            const merged = new Map(
              previous.tasks.map((task) => [task.id, task]),
            );
            for (const task of changed) merged.set(task.id, task);
            if (result.deletedTaskId)
              merged.delete(result.deletedTaskId as string);
            if (result.deletedProjectId)
              for (const [id, task] of merged) {
                if (task.projectId === result.deletedProjectId)
                  merged.set(id, {
                    ...task,
                    projectId: null,
                    version: task.version + 1,
                  });
              }
            const next = { ...previous, tasks: [...merged.values()] };
            serverPageRef.current = next;
            return next;
          });
          setTaskQueryRevision((value) => value + 1);
        }
        setData((current) => {
          if (!current) return current;
          const next = { ...current };
          if (result.deletedTaskId) {
            next.tasks = current.tasks.filter(
              (task) => task.id !== result.deletedTaskId,
            );
            next.notifications = current.notifications.filter(
              (n) => n.taskId !== result.deletedTaskId,
            );
            next.activities = current.activities.map((a) =>
              a.taskId === result.deletedTaskId ? { ...a, taskId: null } : a,
            );
          }
          if (result.deletedProjectId) {
            next.projects = current.projects.filter(
              (project) => project.id !== result.deletedProjectId,
            );
            next.tasks = current.tasks.map((task) =>
              task.projectId === result.deletedProjectId
                ? { ...task, projectId: null, version: task.version + 1 }
                : task,
            );
            next.activities = current.activities.map((a) =>
              a.projectId === result.deletedProjectId
                ? { ...a, projectId: null }
                : a,
            );
          }
          if (command.action === "archiveTemplate")
            next.templates = current.templates?.filter(
              (template) => template.id !== command.id,
            );
          if (result.tasks) {
            const merged = new Map(
              current.tasks.map((task) => [task.id, task]),
            );
            for (const task of result.tasks as Task[])
              merged.set(task.id, task);
            next.tasks = [...merged.values()];
          }
          if (result.savedView)
            next.savedViews = [
              ...(current.savedViews || []),
              result.savedView as NonNullable<
                WorkspaceData["savedViews"]
              >[number],
            ];
          if (result.deletedActivityIds)
            next.activities = current.activities.filter(
              (a) => !(result.deletedActivityIds as string[]).includes(a.id),
            );
          if (result.deletedViewId)
            next.savedViews = current.savedViews?.filter(
              (view) => view.id !== result.deletedViewId,
            );
          if (result.template)
            next.templates = [
              ...(current.templates || []),
              result.template as NonNullable<
                WorkspaceData["templates"]
              >[number],
            ];
          if (result.task) {
            const task = result.task as Task;
            next.tasks = next.tasks.some((t) => t.id === task.id)
              ? next.tasks.map((t) => (t.id === task.id ? task : t))
              : [task, ...next.tasks];
          }
          if (result.project) {
            const project = result.project as Project;
            next.projects = current.projects.some((p) => p.id === project.id)
              ? current.projects.map((p) => (p.id === project.id ? project : p))
              : [...current.projects, project];
          }
          if (result.member) {
            const member = result.member as Member;
            next.members = current.members
              .filter((m) => m.email !== member.email)
              .concat(member);
            if (member.email === current.actor.email) {
              next.actor = { ...current.actor, name: member.name };
              if (current.profile)
                next.profile = {
                  ...current.profile,
                  name: member.name,
                  jobTitle: member.jobTitle || "",
                  version: member.version || current.profile.version,
                };
            }
          }
          if (result.profile) {
            next.profile = result.profile as AccountProfile;
            next.actor = {
              ...next.actor,
              name: next.profile.name,
              image: next.profile.avatarId
                ? `/api/attachments/${next.profile.avatarId}/content`
                : null,
            };
          }
          if (result.settings)
            next.settings = result.settings as WorkspaceSettings;
          if (result.notification) {
            const item = result.notification as { id: string; read: boolean };
            next.notifications = current.notifications.map((n) =>
              n.id === item.id ? { ...n, read: item.read } : n,
            );
          }
          if (command.action === "readNotifications")
            next.notifications = current.notifications.map((n) => ({
              ...n,
              read: true,
            }));
          dataRef.current = next;
          return next;
        });
        return result;
      } finally {
        mutationRef.current = false;
        setBusy(false);
        if (!demo) void refresh(true);
      }
    },
    [demo, refresh, t],
  );
  function archiveFeedback(task: Task) {
    toast.success(
      task.archived ? t("Task moved to Archive") : t("Task restored"),
      {
        action: {
          label: task.archived ? t("View archive") : t("View task"),
          onClick: () => {
            navigate(task.archived ? "archive" : "tasks");
            if (!task.archived) openTask(task);
          },
        },
        cancel: {
          label: t("Undo"),
          onClick: async () => {
            try {
              await run({
                action: "updateTask",
                id: task.id,
                version: task.version,
                patch: { archived: !task.archived },
              });
            } catch (error) {
              toast.error(t((error as Error).message));
            }
          },
        },
      },
    );
  }
  function requestTaskDeletion(task: Task) {
    if (dataRef.current?.actor.isAdmin) {
      // Menu items unmount before the dialog closes; retain the stable trigger.
      deletionReturnFocus.current =
        document.querySelector<HTMLElement>(
          `[data-task-actions="${task.id}"]`,
        ) || (document.activeElement as HTMLElement);
      setDeletionTarget({
        kind: "task",
        id: task.id,
        name: task.title,
        version: task.version,
      });
    }
  }
  function closeSidebar() {
    setSidebarOpen(false);
    if (mobile)
      document
        .querySelector<HTMLButtonElement>(
          window.innerWidth > 640 ? ".rail-menu" : ".mobile-menu",
        )
        ?.focus();
  }
  useEffect(() => {
    if (sidebarOpen)
      document.querySelector<HTMLElement>(".sidebar .mobile-close")?.focus();
  }, [sidebarOpen]);
  function pushLocation(url: URL) {
    const index = (window.history.state?.evolveIndex ?? 0) + 1;
    window.history.pushState(
      { ...window.history.state, evolveIndex: index },
      "",
      url,
    );
    locationRef.current = { index, url: url.href };
  }
  function navigate(next: Page, id?: string) {
    const proceed = () => {
      historyTravelRef.current = null;
      taskHistoryPushed.current = false;
      setTaskOpen(false);
      setTaskLoading(false);
      navigateTo(next, id);
    };
    if (taskEditorRef.current) taskEditorRef.current.requestLeave(proceed);
    else proceed();
  }
  function navigateTo(next: Page, id?: string) {
    setNavigationRevision((value) => value + 1);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("section", next === "dashboard" ? "overview" : next);
    if (id)
      url.searchParams.set(next === "connection" ? "label" : "project", id);
    pushLocation(url);
    window.scrollTo({ top: 0, behavior: "instant" });
    setPage(next);
    setConnectionLabel(next === "connection" ? id || "" : "");
    setProjectId(next === "project" ? id : undefined);
    closeSidebar();
    setQuery("");
    setStatusFilter("");
    setPriorityFilter("");
    setAssigneeFilter("");
    setDueBucket("");
    setOpenOnly(false);
    setDateFrom("");
    setDateTo("");
    setDateMode("due");
    requestAnimationFrame(() => {
      // The document handoff effect already chose a more specific target.
      if (document.activeElement?.id !== "project-documents")
        document
          .querySelector<HTMLElement>("#main-content h1")
          ?.focus({ preventScroll: true });
    });
    if (next === "project") setView("board");
    else setView("list");
  }
  const startTask = useCallback(
    (overrides: TaskDefaults = {}) => {
      if (
        page === "project" &&
        !dataRef.current?.projects.some((project) => project.id === projectId)
      ) {
        toast.error(
          "This project has been deleted. Create tasks from All tasks instead.",
        );
        return;
      }
      if (
        dataRef.current?.settings?.configuration?.readOnly &&
        !dataRef.current.actor.isAdmin
      ) {
        toast.error("Task editing is paused by the administrator.");
        return;
      }
      const defaults: TaskDefaults = {
        dueTimeZone:
          dataRef.current?.profile?.timeZone ||
          dataRef.current?.settings?.timeZone ||
          "Asia/Jakarta",
        projectId: page === "project" ? projectId : null,
        assignee:
          page === "mytasks"
            ? dataRef.current?.actor.email
            : (dataRef.current?.members.find(
                (member) => member.email === assigneeFilter && !member.disabled,
              )?.email ?? null),
        status: statusFilter ? (statusFilter as Status) : "todo",
        priority: priorityFilter
          ? (priorityFilter as Task["priority"])
          : dataRef.current?.settings?.configuration?.defaultPriority || "none",
        ...overrides,
      };
      setTaskDefaults(defaults);
      const url = new URL(window.location.href);
      url.searchParams.set("task", "new");
      url.searchParams.set("compose", JSON.stringify(defaults));
      pushLocation(url);
      taskHistoryPushed.current = true;
      setSelectedId(null);
      setTaskOpen(true);
    },
    [page, projectId, statusFilter, assigneeFilter, priorityFilter],
  );
  const newTask = useCallback(() => startTask(), [startTask]);
  const openTask = useCallback((task: Task, history = true) => {
    const proceed = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("task", task.id);
      url.searchParams.delete("compose");
      if (history && window.location.search !== url.search) {
        const index = (window.history.state?.evolveIndex ?? 0) + 1;
        window.history.pushState(
          { ...window.history.state, evolveIndex: index },
          "",
          url,
        );
        locationRef.current = { index, url: url.href };
        taskHistoryPushed.current = true;
      }
      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          tasks: current.tasks.some((t) => t.id === task.id)
            ? current.tasks.map((t) => (t.id === task.id ? task : t))
            : [task, ...current.tasks],
        };
        dataRef.current = next;
        return next;
      });
      setSelectedId(task.id);
      setOpenedTask(task);
      setTaskOpen(true);
      setSearchOpen(false);
    };
    if (history && taskEditorRef.current) {
      setSearchOpen(false);
      if (new URL(window.location.href).searchParams.get("task") === task.id)
        return;
      taskEditorRef.current.requestLeave(proceed);
    } else proceed();
  }, []);
  useEffect(() => {
    let controller: AbortController | undefined;
    function restoreLocation() {
      const index = window.history.state?.evolveIndex ?? 0;
      const previous = locationRef.current;
      const travel = historyTravelRef.current;
      if (travel?.phase === "restore") {
        travel.phase = "waiting";
        if (travel.busy) historyTravelRef.current = null;
        else if (travel.approved) {
          travel.phase = "proceed";
          window.history.go(travel.delta);
        }
        return;
      }
      const bypass = approvedPopRef.current || travel?.phase === "proceed";
      approvedPopRef.current = false;
      if (travel?.phase === "proceed") historyTravelRef.current = null;
      if (
        !bypass &&
        previous &&
        taskEditorRef.current &&
        previous.url !== window.location.href
      ) {
        let synchronous = true;
        const result = taskEditorRef.current.requestLeave(() => {
          if (synchronous) return;
          const intent = historyTravelRef.current;
          if (!intent) return;
          intent.approved = true;
          if (intent.phase === "waiting") {
            intent.phase = "proceed";
            window.history.go(intent.delta);
          }
        });
        synchronous = false;
        if (result !== "left" && index !== previous.index) {
          historyTravelRef.current = {
            phase: "restore",
            delta: index - previous.index,
            approved: false,
            busy: result === "busy",
          };
          window.history.go(previous.index - index);
          return;
        }
      }
      if (!Object.hasOwn(window.history.state || {}, "evolveIndex"))
        window.history.replaceState(
          { ...window.history.state, evolveIndex: index },
          "",
          window.location.href,
        );
      locationRef.current = { index, url: window.location.href };
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const params = new URLSearchParams(window.location.search);
      const section =
        params.get("section") === "overview"
          ? "dashboard"
          : params.get("section");
      const allowed = [
        "dashboard",
        "projects",
        "connection",
        "tasks",
        "mytasks",
        "inbox",
        "team",
        "activity",
        "archive",
        "settings",
        "templates",
        "files",
        "project",
      ];
      setPage(
        allowed.includes(section || "") ? (section as Page) : "dashboard",
      );
      setConnectionLabel(params.get("label") || "");
      setProjectId(params.get("project") || undefined);
      setView(
        ["board", "calendar"].includes(params.get("view") || "")
          ? (params.get("view") as View)
          : "list",
      );
      setQuery(params.get("q") || "");
      setStatusFilter(
        STATUSES.includes(params.get("status") as Status)
          ? params.get("status")!
          : "",
      );
      setPriorityFilter(
        PRIORITIES.includes(params.get("priority") as Task["priority"])
          ? params.get("priority")!
          : "",
      );
      setAssigneeFilter(params.get("assignee") || "");
      setOpenOnly(params.get("open") === "true");
      const dateParam = (key: string) => {
        const value = params.get(key) || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
        const parsed = new Date(value + "T12:00:00Z");
        return !Number.isNaN(+parsed) &&
          parsed.toISOString().slice(0, 10) === value
          ? value
          : "";
      };
      const calendarView = params.get("view") === "calendar";
      setDateFrom(calendarView ? "" : dateParam("from"));
      setDateTo(calendarView ? "" : dateParam("to"));
      setDateMode(params.get("dateMode") === "overlap" ? "overlap" : "due");
      setDueBucket(
        ["overdue", "upcoming", "today", "future", "unscheduled"].includes(
          params.get("dueBucket") || "",
        )
          ? params.get("dueBucket")!
          : "",
      );
      setSort(
        ["due", "priority", "title"].includes(params.get("sort") || "")
          ? params.get("sort")!
          : "updated",
      );
      const id = params.get("task");
      setTaskLoading(false);
      if (id === "new") {
        const parsed = taskDefaultSchema.safeParse(
          (() => {
            try {
              return JSON.parse(params.get("compose") || "{}");
            } catch {
              return {};
            }
          })(),
        );
        setTaskDefaults(parsed.success ? parsed.data : {});
        setSelectedId(null);
        setTaskOpen(true);
        return;
      }
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        setTaskOpen(false);
        return;
      }
      setTaskOpen(false);
      if (demo) {
        const task = getSavedDemo()?.tasks.find((task) => task.id === id);
        if (task) openTask(task, false);
      } else {
        setTaskLoading(true);
        fetch(`/api/tasks/${id}`, { signal, cache: "no-store" })
          .then(async (response) => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            return result.task;
          })
          .then((task) => {
            if (!signal.aborted) openTask(task, false);
          })
          .catch((error) => {
            if (!signal.aborted) toast.error(error.message);
          })
          .finally(() => {
            if (!signal.aborted) setTaskLoading(false);
          });
      }
    }
    restoreLocation();
    window.addEventListener("popstate", restoreLocation);
    return () => {
      controller?.abort();
      window.removeEventListener("popstate", restoreLocation);
    };
  }, [demo, openTask]);
  useEffect(() => {
    if (!taskRoute) return;
    const url = new URL(window.location.href);
    const fields = {
      q: query,
      status: statusFilter,
      priority: priorityFilter,
      assignee: assigneeFilter,
      dueBucket,
      open: openOnly ? "true" : "",
      from: dateFrom,
      to: dateTo,
      dateMode: (dateFrom || dateTo) && dateMode === "overlap" ? "overlap" : "",
      sort: sort === "updated" ? "" : sort,
      view: view === "list" ? "" : view,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
    if (locationRef.current) locationRef.current.url = url.href;
  }, [
    navigationRevision,
    taskRoute,
    query,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    dueBucket,
    openOnly,
    sort,
    view,
    dateFrom,
    dateTo,
    dateMode,
  ]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        editingMember ||
        batchDialog ||
        e.defaultPrevented ||
        document.querySelector('[role="listbox"]:not(#task-search-results)') ||
        (document.querySelector('[role="dialog"]') && !searchOpen)
      )
        return;
      const typing =
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "f" &&
        !e.altKey &&
        !e.shiftKey &&
        !taskOpen &&
        !projectOpen &&
        !inviteOpen &&
        !shortcutsOpen
      ) {
        e.preventDefault();
        if (searchOpen) {
          const input = document.querySelector<HTMLInputElement>(
            ".search-modal-input input",
          );
          input?.focus();
          input?.select();
        } else setSearchOpen(true);
      }
      if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !taskOpen &&
        !projectOpen &&
        !inviteOpen &&
        !searchOpen
      ) {
        if (e.key === "n") newTask();
        if (e.key === "?") setShortcutsOpen(true);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    taskOpen,
    projectOpen,
    inviteOpen,
    searchOpen,
    shortcutsOpen,
    newTask,
    editingMember,
    batchDialog,
  ]);
  async function loadMore() {
    if (
      !demo &&
      taskRoute &&
      serverPage?.signature === queryParameters &&
      serverPage.nextCursor
    ) {
      if (loadingMore) return;
      setLoadingMore(true);
      try {
        const params = new URLSearchParams(queryParameters);
        params.set("cursor", serverPage.nextCursor);
        const response = await fetch(`/api/tasks?${params}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (serverPageRef.current?.signature !== queryParameters) return;
        const merged = new Map(
          [...serverPageRef.current.tasks, ...result.tasks].map((t: Task) => [
            t.id,
            t,
          ]),
        );
        const next = {
          ...serverPageRef.current,
          tasks: [...merged.values()],
          nextCursor: result.nextCursor,
          total: result.total,
        };
        serverPageRef.current = next;
        setServerPage(next);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoadingMore(false);
      }
      return;
    }
    if (!demo && taskRoute) return;
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/workspace?cursor=${data.nextCursor}`);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t("Couldn’t load tasks"));
      setData((current) =>
        current
          ? {
              ...current,
              tasks: [
                ...current.tasks,
                ...result.tasks.filter(
                  (t: Task) =>
                    !current.tasks.some((existing) => existing.id === t.id),
                ),
              ],
              nextCursor: result.nextCursor,
            }
          : current,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  const queryReady =
    demo || !taskRoute || serverPage?.signature === queryParameters;
  const tasks = useMemo(() => {
    if (!data) return [];
    const source =
      !demo && taskRoute
        ? serverPage?.signature === queryParameters
          ? serverPage.tasks
          : []
        : data.tasks;
    let result = source.filter((t) =>
      page === "archive" ? t.archived : !t.archived,
    );
    if (page === "project")
      result = result.filter((t) => t.projectId === projectId);
    if (page === "mytasks")
      result = result.filter((t) => t.assignee === data.actor.email);
    if (query) result = result.filter((task) => matchesTaskSearch(task, query));
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    if (openOnly) result = result.filter((t) => t.status !== "done");
    if (priorityFilter)
      result = result.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter)
      result = result.filter((t) =>
        assigneeFilter === "unassigned"
          ? !t.assignee
          : t.assignee === assigneeFilter,
      );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: data.profile?.timeZone || "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (dueBucket === "overdue")
      result = result.filter(
        (task) =>
          task.status !== "done" && task.dueDate && task.dueDate < today,
      );
    if (dueBucket === "upcoming")
      result = result.filter(
        (task) =>
          task.status !== "done" && task.dueDate && task.dueDate >= today,
      );
    if (dueBucket === "today")
      result = result.filter(
        (task) => task.status !== "done" && task.dueDate === today,
      );
    if (dueBucket === "future")
      result = result.filter(
        (task) =>
          task.status !== "done" && task.dueDate && task.dueDate > today,
      );
    if (dueBucket === "unscheduled")
      result = result.filter((task) => task.status !== "done" && !task.dueDate);
    if (demo && (dateFrom || dateTo))
      result = result.filter(
        (task) =>
          task.dueDate &&
          (!dateFrom || task.dueDate >= dateFrom) &&
          (!dateTo ||
            (dateMode === "overlap"
              ? task.startDate || task.dueDate
              : task.dueDate) <= dateTo),
      );
    return [...result].sort((a, b) =>
      sort === "due"
        ? (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
        : sort === "priority"
          ? PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)
          : sort === "title"
            ? a.title.localeCompare(b.title)
            : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [
    data,
    page,
    projectId,
    query,
    statusFilter,
    dueBucket,
    openOnly,
    priorityFilter,
    assigneeFilter,
    sort,
    demo,
    taskRoute,
    serverPage,
    queryParameters,
    dateFrom,
    dateTo,
    dateMode,
  ]);
  function exportTasks() {
    if (!data) return;
    if (!demo) {
      const params = new URLSearchParams(queryParameters);
      params.delete("cursor");
      const link = document.createElement("a");
      link.href = `/api/tasks/export?${params}`;
      link.download = "evolve-tasks.csv";
      link.click();
      return;
    }
    const blob = new Blob(["\ufeff" + csvExport(tasks)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evolve-tasks-${formatDate(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("Tasks exported"));
  }
  async function changeTheme(value: ThemePreference) {
    if (themePending || mutationRef.current) return;
    const current = dataRef.current;
    if (!current) return;
    const profile = current.profile || defaultProfile(current.actor.name);
    setThemePending(value);
    applyTheme(value);
    try {
      await run({
        action: "updateProfile",
        ...profile,
        preferences: { ...profile.preferences, theme: value },
      });
    } catch (e) {
      applyTheme(dataRef.current?.profile?.preferences.theme || "system");
      toast.error((e as Error).message);
    } finally {
      setThemePending(null);
    }
  }
  function requestLogout() {
    const proceed = () => {
      setTaskOpen(false);
      void logout();
    };
    if (taskEditorRef.current)
      taskEditorRef.current.requestLeave(proceed, true);
    else proceed();
  }
  async function logout() {
    if (demo) {
      clearBrowserDrafts();
      clearTaskDrafts(dataRef.current!.actor.email, demo);
      clearProjectDrafts(dataRef.current!.actor.email, demo);
      router.push("/");
      router.refresh();
      return;
    }
    try {
      const r = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error();
      clearBrowserDrafts();
      clearTaskDrafts(dataRef.current!.actor.email, demo);
      clearProjectDrafts(dataRef.current!.actor.email, demo);
      router.push("/");
      router.refresh();
    } catch {
      toast.error(t("Couldn’t sign out. Please try again."));
    }
  }
  if (!data)
    return (
      <main className="workspace-loading">
        <Logo name="Locker Room" />
        <Spinner />
        <p>{t("Making a little space…")}</p>
      </main>
    );
  const currentProject = data.projects.find((p) => p.id === projectId);
  const counts = data.tasks.filter((t) => !t.archived);
  const unread = data.notifications.filter((n) => !n.read).length;
  const titles: Record<Page, string> = {
    dashboard: "Overview",
    projects: "Projects",
    connection: "Connection",
    tasks: t("All tasks"),
    mytasks: t("My tasks"),
    inbox: t("Inbox"),
    team: t("People"),
    activity: t("Activity"),
    files: "Locker Room files",
    templates: "Task Templates",
    archive: t("Archive"),
    settings: t("Settings"),
    project: currentProject?.name || t("Project"),
  };
  const subtitles: Record<Page, string> = {
    dashboard:
      "A shared view of your team’s progress, priorities, and delivery.",
    projects: data.canonicalProjects
      ? "Shared Board Room projects and their assigned work."
      : "Plan delivery, ownership, schedules, and project costs in one place.",
    connection: data.canonicalProjects
      ? "Explore shared projects and their Locker Room tasks."
      : "Explore how shared labels connect projects and tasks across your workspace.",
    tasks: t("Everything your team is moving forward."),
    mytasks: t("Your next steps, all in one place."),
    inbox: t("The things that need a little of your attention."),
    team: t("Good people. Great things ahead."),
    activity: t("A shared story of progress, one update at a time."),
    files: "Manage private Locker Room files and storage.",
    templates: "Starting points for your task workflows.",
    archive: t("A little less clutter. Nothing lost."),
    settings: t("Make yourself at home."),
    project:
      currentProject?.description ||
      t("A shared direction for your next big idea."),
  };
  const isTaskPage =
    ["tasks", "mytasks", "project", "archive"].includes(page) &&
    (page !== "project" || Boolean(currentProject));
  const shared = {
    data,
    demo,
    run,
    openTask,
    newTask,
    calendarMonth,
    onCalendarMonthChange: setCalendarMonth,
    calendarSelectedDate: selectedCalendarDate || accountCalendarDate,
    onCalendarDateChange: setCalendarSelectedDate,
    archiveView: page === "archive",
    onArchiveChange: archiveFeedback,
    onDeleteTask: data.actor.isAdmin ? requestTaskDeletion : undefined,
    newTaskForStatus: (status: Status) => startTask({ status }),
    newTaskForDate:
      page === "archive"
        ? undefined
        : (dueDate: string) => startTask({ dueDate }),
  };
  function navButton(
    id: Page,
    label: string,
    Icon: typeof LayoutDashboard,
    badge?: number,
  ) {
    return (
      <button
        key={id}
        className={clsx("nav-item", page === id && "active")}
        onClick={() => navigate(id)}
        aria-label={t(label)}
        data-sidebar-label={t(label)}
        title={t(label)}
        aria-current={page === id ? "page" : undefined}
      >
        <Icon size={17} />
        <span>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className={id === "inbox" ? "nav-badge inbox-badge" : "nav-badge"}
          >
            {badge}
          </span>
        )}
      </button>
    );
  }
  return (
    <div
      className={clsx(
        "app-shell",
        demo && "is-demo",
        !mobile && sidebarCollapsed && "sidebar-collapsed",
        data.profile?.preferences.density === "compact" && "density-compact",
      )}
      data-accent={data.settings?.accent || "green"}
      data-density={data.profile?.preferences.density || "comfortable"}
      data-font-scale={data.settings?.configuration.fontScale ?? "standard"}
      data-content-width={data.settings?.configuration.contentWidth ?? "wide"}
      data-reduce-motion={data.profile?.preferences.reduceMotion || false}
    >
      <a className="skip-link" href="#main-content">
        {t("Skip to content")}
      </a>
      {demo && (
        <div className="demo-banner">
          <span>
            <Sparkles size={12} />
            <strong>{t("Make yourself at home.")}</strong>{" "}
            {t("This is a demo. Changes stay in this browser.")}
          </span>
          <Link href="/">
            {t("Sign in to your workspace")} <ArrowUpRight size={12} />
          </Link>
        </div>
      )}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}
      <nav
        className="tablet-rail"
        aria-label="Quick navigation"
        inert={sidebarOpen}
      >
        <button
          className="icon-button rail-menu"
          aria-label="Open navigation"
          title="Open navigation"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>
        {navButton("dashboard", "Overview", LayoutDashboard)}
        {navButton("tasks", "All tasks", List)}
        {navButton("mytasks", "My tasks", CheckCheck)}
        {navButton("projects", "Projects", LayoutGrid)}
        {navButton("connection", "Connection", GitBranch)}
        {navButton("inbox", "Inbox", Inbox)}
        <div className="rail-spacer" />
        {navButton("settings", "Settings", Settings)}
      </nav>
      <aside
        inert={mobile && !sidebarOpen}
        role={mobile && sidebarOpen ? "dialog" : undefined}
        aria-modal={mobile && sidebarOpen ? true : undefined}
        aria-label={t("Workspace navigation")}
        onKeyDown={(e) => {
          // Portalled dialogs own their keyboard handling; keep the drawer open beneath them.
          if (e.defaultPrevented || !e.currentTarget.contains(e.target as Node))
            return;
          if (e.key === "Escape") closeSidebar();
          if (e.key === "Tab" && mobile && sidebarOpen) {
            const items = e.currentTarget.querySelectorAll<HTMLElement>(
              "a[href],button:not(:disabled),input,select",
            );
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
        className={clsx("sidebar", sidebarOpen && "is-open")}
      >
        <div className="sidebar-brand">
          <Link
            href={demo ? "/demo" : "/app"}
            aria-label={"Locker Room overview"}
          >
            <Logo name="Locker Room" />
          </Link>
          <button
            className="icon-button sidebar-collapse"
            aria-label={
              sidebarCollapsed ? t("Perluas navigasi") : t("Perkecil navigasi")
            }
            disabled={collapsePending !== null}
            aria-expanded={!sidebarCollapsed}
            onClick={() => {
              const profile = data.profile || defaultProfile(data.actor.name);
              const nextCollapsed = !sidebarCollapsed;
              setCollapsePending(nextCollapsed);
              void run({
                action: "updateProfile",
                ...profile,
                preferences: {
                  ...profile.preferences,
                  sidebarCollapsed: nextCollapsed,
                },
              })
                .catch((e) => toast.error(e.message))
                .finally(() => setCollapsePending(null));
            }}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          <button
            className="icon-button mobile-close"
            aria-label={t("Close navigation")}
            onClick={closeSidebar}
          >
            <X size={18} />
          </button>
        </div>
        {!demo && (
          <RoomSwitcher
            email={data.actor.email}
            room="locker"
            beforeNavigate={(href) => {
              const proceed = () => {
                setSidebarOpen(false);
                router.push(href);
              };
              if (taskEditorRef.current)
                taskEditorRef.current.requestLeave(proceed, true);
              else proceed();
            }}
          />
        )}

        <button
          className="sidebar-search"
          aria-label="Quick find"
          aria-keyshortcuts="Control+f Meta+f"
          data-sidebar-label="Quick find · Ctrl+F"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={15} />
          <span>{t("Quick find")}</span>
          <kbd>Ctrl F</kbd>
        </button>
        <SidebarNavigation
          page={page === "project" ? `project:${projectId}` : page}
        >
          <div className="nav-section-label">{t("YOUR WORKSPACE")}</div>
          {navButton("dashboard", "Overview", LayoutDashboard)}
          {navButton("projects", "Projects", LayoutGrid)}
          {navButton("connection", "Connection", GitBranch)}
          {navButton("inbox", t("Inbox"), Inbox, unread)}
          {navButton(
            "mytasks",
            t("My tasks"),
            CheckCheck,
            data.stats?.myOpen ??
              counts.filter(
                (t) => t.assignee === data.actor.email && t.status !== "done",
              ).length,
          )}
          {navButton("tasks", t("All tasks"), List)}
          {navButton(
            "archive",
            t("Archive"),
            Archive,
            data.stats?.archived ??
              data.tasks.filter((task) => task.archived).length,
          )}
          <div className="nav-section-label projects-label">
            <span>{t("PROJECTS")}</span>
            {data.actor.isAdmin && !data.canonicalProjects && (
              <button
                className="icon-button"
                aria-label={t("Create project")}
                onClick={() => {
                  setEditProject(undefined);
                  setProjectCostsOnly(false);
                  setProjectOpen(true);
                }}
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          {data.projects.map((p) => (
            <button
              key={p.id}
              aria-label={`Project: ${p.name}`}
              title={p.name}
              data-sidebar-label={p.name}
              className={clsx(
                "nav-item project-nav",
                page === "project" && projectId === p.id && "active",
              )}
              onClick={() => navigate("project", p.id)}
            >
              <i className={`project-dot color-${p.color}`} aria-hidden="true">
                {p.name.slice(0, 2).toUpperCase()}
              </i>
              <span>{p.name}</span>
              <span className="project-nav-count">
                {data.stats?.byProject[p.id]?.open ??
                  counts.filter(
                    (t) => t.projectId === p.id && t.status !== "done",
                  ).length}
              </span>
            </button>
          ))}
          {!data.projects.length && (
            <p className="nav-empty">{t("Your next big idea belongs here.")}</p>
          )}
          <SidebarCommonLinks
            current={page === "team" ? "people" : page}
            admin={data.actor.isAdmin}
            onNavigate={(destination) => {
              if (destination === "people") navigate("team");
              else if (destination === "activity") navigate("activity");
              else if (destination === "files") navigate("files");
              else if (destination === "templates") navigate("templates");
              else {
                const proceed = () => {
                  setSidebarOpen(false);
                  router.push("/workspace");
                };
                if (taskEditorRef.current)
                  taskEditorRef.current.requestLeave(proceed, true);
                else proceed();
              }
            }}
          />
        </SidebarNavigation>
        <SidebarFooter
          actor={data.actor}
          theme={theme}
          disabled={busy || themePending !== null}
          demo={demo}
          onTheme={(value) => void changeTheme(value)}
          onSettings={() => navigate("settings")}
          onShortcuts={() => setShortcutsOpen(true)}
          onLogout={requestLogout}
        />
        {!mobile && sidebarCollapsed && <SidebarHints />}
      </aside>
      <div className="main-shell" inert={mobile && sidebarOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t("Open navigation")}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-workspace">
              {data.settings?.name || "Evolve"}
            </span>
            <ChevronRight size={12} />
            <strong>
              {taskOpen
                ? selectedId
                  ? "Task details"
                  : "Create task"
                : titles[page]}
            </strong>
          </div>
          <div className="topbar-actions">
            <LiveClock
              timeZone={
                data.profile?.timeZone ||
                data.settings?.timeZone ||
                "Asia/Jakarta"
              }
            />
            <span
              className={clsx(
                "sync-status",
                (offline || syncError) && "sync-warning",
              )}
            >
              {busy ? (
                <>
                  <Spinner />
                  {t("Saving")}
                </>
              ) : offline ? (
                <>
                  <WifiOff size={12} />
                  {t("Offline")}
                </>
              ) : syncError ? (
                <>
                  <RefreshCw size={12} />
                  {t("Sync interrupted")}
                </>
              ) : (
                <>
                  <span className="green-dot" />
                  {demo
                    ? t("Browser demo")
                    : liveState === "live"
                      ? t("Live · tersimpan")
                      : liveState === "fallback"
                        ? t("Sinkronisasi berkala")
                        : liveState === "reconnecting"
                          ? t("Menghubungkan ulang…")
                          : t("Menghubungkan…")}
                </>
              )}
            </span>
            {!demo && (
              <button
                className="icon-button"
                aria-label={t("Refresh workspace")}
                onClick={() => void refresh()}
                disabled={syncing}
              >
                {syncing ? <Spinner /> : <RefreshCw size={15} />}
              </button>
            )}
            <button
              className="icon-button notification-button"
              aria-label={t("Open inbox, {count} unread notifications", {
                count: unread,
              })}
              onClick={() => navigate("inbox")}
            >
              <Bell size={17} />
              {unread > 0 && <i />}
            </button>
            <span className="topbar-divider" />
            <div className="topbar-avatars">
              {data.members
                .filter((m) => !m.disabled)
                .slice(0, 3)
                .map((m) => (
                  <Avatar key={m.email} small name={m.name} color={m.color} />
                ))}
            </div>
            {data.actor.isAdmin && (
              <button
                className="button secondary small-button top-invite"
                onClick={() => setInviteOpen(true)}
              >
                <Plus size={13} />
                {t("Invite")}
              </button>
            )}
          </div>
        </header>
        <main
          className={clsx(
            "workspace-main",
            !taskOpen && isTaskPage && "tasks-main",
            taskOpen && "editor-main",
          )}
          id="main-content"
          data-page={taskOpen ? "task-editor" : page}
        >
          {offline && !demo && (
            <div className="offline-banner" role="status">
              <WifiOff size={14} />
              {t(
                "You’re offline. Reconnect before making changes to the workspace.",
              )}
            </div>
          )}
          {data.settings?.configuration?.readOnly && !data.actor.isAdmin && (
            <p className="offline-banner" role="status">
              Task editing is paused by the administrator. You can continue
              viewing work and joining discussions.
            </p>
          )}
          {taskLoading ? (
            <div className="editor-loading" role="status">
              <Spinner /> Loading task…
            </div>
          ) : taskOpen ? (
            <TaskEditor
              ref={taskEditorRef}
              key={selectedId || "new"}
              task={
                data.tasks.find((t) => t.id === selectedId) ||
                (openedTask?.id === selectedId ? openedTask : null)
              }
              defaults={taskDefaults}
              onOpenTask={openTask}
              onArchiveChange={archiveFeedback}
              onDeleteTask={requestTaskDeletion}
              data={data}
              run={run}
              demo={demo}
              onClose={() => {
                setTaskOpen(false);
                requestAnimationFrame(() => {
                  const target = !selectedId
                    ? document.querySelector<HTMLElement>("[data-create-task]")
                    : document.querySelector<HTMLElement>("#main-content h1");
                  target?.focus({ preventScroll: true });
                });
                if (taskHistoryPushed.current) {
                  taskHistoryPushed.current = false;
                  approvedPopRef.current = true;
                  window.history.back();
                  return;
                }
                const url = new URL(window.location.href);
                url.searchParams.delete("task");
                url.searchParams.delete("compose");
                window.history.replaceState(window.history.state, "", url);
                if (locationRef.current) locationRef.current.url = url.href;
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>("#main-content h1")
                    ?.focus({ preventScroll: true }),
                );
              }}
            />
          ) : (
            <>
              <div className="page-header">
                <div>
                  <div className="page-eyebrow">
                    {page === "dashboard"
                      ? "WORKSPACE INTELLIGENCE"
                      : page === "project"
                        ? t("YOUR PROJECT")
                        : page === "mytasks"
                          ? t("A LITTLE FOCUS GOES A LONG WAY")
                          : t("YOUR WORKSPACE")}
                  </div>
                  {page === "project" && currentProject?.category && (
                    <span className="project-category-badge">
                      {currentProject.category}
                    </span>
                  )}
                  {page === "project" &&
                    currentProject?.plannedCodYear != null && (
                      <span className="project-cod-badge">
                        Planned COD {currentProject.plannedCodYear}
                      </span>
                    )}
                  <h1 tabIndex={-1}>
                    {page === "project" && currentProject && (
                      <span
                        className={`project-icon color-${currentProject.color}`}
                      >
                        {currentProject.name[0]}
                      </span>
                    )}
                    {titles[page]}
                    {isTaskPage && (
                      <span className="page-task-count">
                        {!demo
                          ? serverPage?.signature === queryParameters
                            ? serverPage.total
                            : "…"
                          : tasks.length}
                      </span>
                    )}
                  </h1>
                  <p>{subtitles[page]}</p>
                </div>
                <div className="page-header-actions">
                  {isTaskPage && (
                    <>
                      <button
                        className="button secondary"
                        disabled={
                          data.settings?.configuration?.readOnly &&
                          !data.actor.isAdmin
                        }
                        onClick={() => setBatchDialog("bulk")}
                      >
                        {t("Edit massal")}
                      </button>
                      {page !== "archive" && (
                        <button
                          className="button secondary"
                          disabled={
                            data.settings?.configuration?.readOnly &&
                            !data.actor.isAdmin
                          }
                          onClick={() => setBatchDialog("import")}
                        >
                          {t("Impor CSV")}
                        </button>
                      )}
                    </>
                  )}
                  {page === "project" &&
                    currentProject &&
                    data.actor.isAdmin &&
                    !data.canonicalProjects && (
                      <button
                        className="button secondary"
                        aria-label={t("Edit project")}
                        onClick={() => {
                          setEditProject(currentProject);
                          setProjectCostsOnly(false);
                          setProjectOpen(true);
                        }}
                      >
                        <Settings size={15} />
                        <span>{t("Project settings")}</span>
                      </button>
                    )}
                  {page === "project" &&
                    currentProject &&
                    data.actor.isAdmin &&
                    !data.canonicalProjects && (
                      <button
                        className="button secondary entity-delete-trigger"
                        onClick={(event) => {
                          deletionReturnFocus.current = event.currentTarget;
                          setDeletionTarget({
                            kind: "project",
                            id: currentProject.id,
                            name: currentProject.name,
                            version: currentProject.version || 1,
                          });
                        }}
                      >
                        <Trash2 size={15} />
                        Delete project
                      </button>
                    )}
                  {["dashboard", "tasks", "mytasks", "project"].includes(
                    page,
                  ) && (
                    <button
                      className="button primary"
                      data-create-task
                      aria-label={t("New task")}
                      disabled={page === "project" && !currentProject}
                      aria-keyshortcuts="N"
                      onClick={newTask}
                    >
                      <Plus size={16} />
                      <span>{t("New task")}</span>
                      <kbd aria-hidden="true">N</kbd>
                    </button>
                  )}
                  {page === "team" && data.actor.isAdmin && (
                    <button
                      className="button primary"
                      onClick={() => setInviteOpen(true)}
                    >
                      <Plus size={15} />
                      {t("Invite teammate")}
                    </button>
                  )}
                </div>
              </div>
              {page === "project" && !currentProject && (
                <div className="panel">
                  <Empty
                    icon={<Archive size={24} />}
                    title="Project no longer available"
                    description="This project has been removed. Its tasks are available in All tasks and Archive."
                    action={
                      <button
                        className="button secondary"
                        onClick={() => navigate("projects")}
                      >
                        Back to Projects
                      </button>
                    }
                  />
                </div>
              )}
              {page === "dashboard" && (
                <>
                  <Dashboard
                    {...shared}
                    onExploreConnections={(label) =>
                      navigate("connection", label)
                    }
                    onProject={(id) => navigate("project", id)}
                    onCreateProject={() => {
                      setEditProject(undefined);
                      setProjectCostsOnly(false);
                      setProjectOpen(true);
                    }}
                    onFilter={(filters) => {
                      navigate("tasks");
                      setStatusFilter(filters.status || "");
                      setPriorityFilter(filters.priority || "");
                      setOpenOnly(filters.open || false);
                      setAssigneeFilter(filters.assignee || "");
                      setDueBucket(filters.dueBucket || "");
                      setDateFrom(filters.from || "");
                      setDateTo(filters.to || "");
                      setDateMode(filters.dateMode || "due");
                      setView("list");
                      setFilterOpen(true);
                    }}
                  />
                </>
              )}
              {page === "connection" && (
                <Connections
                  run={run}
                  data={data}
                  demo={demo}
                  label={connectionLabel}
                  onSelect={(label) => {
                    setConnectionLabel(label);
                    const url = new URL(window.location.href);
                    url.searchParams.set("label", label);
                    pushLocation(url);
                  }}
                  onOpen={async (entity: ConnectionEntity, signal) => {
                    if (entity.kind === "project") {
                      navigate("project", entity.id);
                      return;
                    }
                    let task = dataRef.current?.tasks.find(
                      (task) => task.id === entity.id,
                    );
                    if (!task) {
                      const response = await fetch(
                        `/api/tasks/${encodeURIComponent(entity.id)}`,
                        { signal, cache: "no-store" },
                      );
                      const body = await response.json();
                      if (!response.ok) throw new Error(body.error);
                      task = body.task;
                    }
                    if (!signal.aborted && task && task.id === entity.id)
                      openTask(task);
                  }}
                />
              )}
              {page === "project" && currentProject && !demo && (
                <RelatedRoomProjects
                  key={`related-${currentProject.id}`}
                  room="locker"
                  id={currentProject.id}
                  revision={currentProject.version}
                />
              )}
              {page === "project" &&
                Boolean(currentProject?.labels?.length) && (
                  <div
                    className="project-connection-labels"
                    aria-label="Project connection labels"
                  >
                    <Tag size={14} />
                    {currentProject!.labels!.map((label) => (
                      <button
                        key={label}
                        onClick={() => navigate("connection", labelKey(label))}
                      >
                        {displayLabel(label)}
                      </button>
                    ))}
                  </div>
                )}
              {page === "projects" && (
                <ProjectPortfolio
                  {...shared}
                  onProject={(id) => navigate("project", id)}
                  onCreate={() => {
                    setEditProject(undefined);
                    setProjectCostsOnly(false);
                    setProjectOpen(true);
                  }}
                />
              )}
              {page === "archive" && (
                <div className="archive-notice" role="status">
                  <Archive size={20} />
                  <div>
                    <strong>{t("Your archived tasks are safe here")}</strong>
                    <p>
                      {t(
                        "Search this archive or restore a task to return it to your active work. Projects, comments, and attachments are kept.",
                      )}
                    </p>
                  </div>
                </div>
              )}
              {isTaskPage && (
                <>
                  <div className="task-view-bar">
                    <div
                      hidden={page === "archive"}
                      className="view-tabs"
                      role="tablist"
                      aria-label={t("Task view")}
                    >
                      {(
                        [
                          ["list", List, t("List")],
                          ["board", LayoutGrid, t("Board")],
                          ["calendar", CalendarDays, t("Calendar")],
                        ] as const
                      ).map(([id, Icon, label]) => (
                        <button
                          key={id}
                          role="tab"
                          aria-selected={view === id}
                          className={view === id ? "active" : ""}
                          onClick={() => {
                            setView(id);
                            if (id === "calendar") {
                              setDateFrom("");
                              setDateTo("");
                              setDateMode("due");
                            }
                          }}
                        >
                          <Icon size={15} />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="task-view-actions">
                      <SavedViews
                        data={data}
                        run={run}
                        filters={{
                          scope: page as
                            "tasks" | "mytasks" | "archive" | "project",
                          projectId,
                          q: query,
                          status: statusFilter as Task["status"] | "",
                          priority: priorityFilter as Task["priority"] | "",
                          assignee: assigneeFilter,
                          open: openOnly,
                          from: dateFrom || undefined,
                          to: dateTo || undefined,
                          dateMode: dateFrom || dateTo ? dateMode : undefined,
                          dueBucket: dueBucket as
                            | ""
                            | "overdue"
                            | "upcoming"
                            | "today"
                            | "future"
                            | "unscheduled",
                          sort: sort as
                            "updated" | "due" | "priority" | "title",
                          view,
                        }}
                        onApply={(filters) => {
                          const projectExists = data.projects.some(
                            (project) => project.id === filters.projectId,
                          );
                          if (filters.scope === "project" && !projectExists)
                            toast.info(
                              "This project has been deleted. Showing All tasks with your saved filters.",
                            );
                          navigate(
                            filters.scope === "project" && !projectExists
                              ? "tasks"
                              : filters.scope,
                            projectExists ? filters.projectId : undefined,
                          );
                          setQuery(filters.q);
                          setStatusFilter(filters.status);
                          setPriorityFilter(filters.priority);
                          setAssigneeFilter(filters.assignee);
                          setDueBucket(filters.dueBucket);
                          setOpenOnly(filters.open || false);
                          setDateFrom(
                            filters.view === "calendar"
                              ? ""
                              : filters.from || "",
                          );
                          setDateTo(
                            filters.view === "calendar" ? "" : filters.to || "",
                          );
                          setDateMode(filters.dateMode || "due");
                          setSort(filters.sort);
                          setView(filters.view);
                        }}
                      />
                      <div className="task-search">
                        <Search size={14} />
                        <input
                          aria-label={t("Search tasks")}
                          placeholder={t("Search tasks…")}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        {query && (
                          <button
                            className="icon-button"
                            aria-label={t("Clear search")}
                            onClick={() => setQuery("")}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      <button
                        className={clsx(
                          "button subtle small-button",
                          filterOpen && "filter-active",
                        )}
                        onClick={() => setFilterOpen((v) => !v)}
                        aria-expanded={filterOpen}
                      >
                        <SlidersHorizontal size={14} />
                        Filter
                        {[
                          statusFilter,
                          priorityFilter,
                          assigneeFilter,
                          dueBucket,
                          openOnly,
                        ].filter(Boolean).length > 0 && (
                          <span className="filter-count">
                            {
                              [
                                statusFilter,
                                priorityFilter,
                                assigneeFilter,
                                dueBucket,
                                openOnly,
                              ].filter(Boolean).length
                            }
                          </span>
                        )}
                      </button>
                      <Dropdown.Root>
                        <Dropdown.Trigger
                          className="icon-button"
                          aria-label={t("View options")}
                        >
                          <ChevronDown size={16} />
                        </Dropdown.Trigger>
                        <Dropdown.Portal>
                          <Dropdown.Content
                            className="dropdown-menu"
                            align="end"
                          >
                            <Dropdown.Label>
                              {t("Sort tasks by")}
                            </Dropdown.Label>
                            {[
                              ["updated", t("Recently updated")],
                              ["due", t("Due date")],
                              ["priority", t("Priority")],
                              ["title", t("Task name")],
                            ].map(([value, label]) => (
                              <Dropdown.Item
                                key={value}
                                onSelect={() => setSort(value)}
                              >
                                {label}
                                {sort === value && <Check size={13} />}
                              </Dropdown.Item>
                            ))}
                            <Dropdown.Separator />
                            <Dropdown.Item onSelect={exportTasks}>
                              <ArrowDownToLine size={14} />
                              {t("Export this view as CSV")}
                            </Dropdown.Item>
                          </Dropdown.Content>
                        </Dropdown.Portal>
                      </Dropdown.Root>
                    </div>
                  </div>
                  {(dateFrom || dateTo) && (
                    <div className="task-window-summary" role="status">
                      <span>
                        {dateMode === "overlap"
                          ? "Scheduled work"
                          : "Deadlines"}
                        : {dateFrom || "Any start"}
                        {dateFrom !== dateTo ? ` – ${dateTo || "Any end"}` : ""}
                      </span>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                          setDateMode("due");
                        }}
                      >
                        Clear date window
                      </button>
                    </div>
                  )}
                  {filterOpen && (
                    <div className="filter-bar">
                      <label>
                        Status
                        <AppSelect
                          aria-label="Status"
                          value={statusFilter}
                          onValueChange={(nextValue) => {
                            setStatusFilter(nextValue);
                            if (nextValue === "done") setOpenOnly(false);
                          }}
                        >
                          <option value="">{t("All statuses")}</option>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(STATUS_LABEL[s])}
                            </option>
                          ))}
                        </AppSelect>
                      </label>
                      <label>
                        {t("Priority")}
                        <AppSelect
                          aria-label={t("Priority")}
                          value={priorityFilter}
                          onValueChange={(nextValue) =>
                            setPriorityFilter(nextValue)
                          }
                        >
                          <option value="">{t("All priorities")}</option>
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {t(PRIORITY_LABEL[p])}
                            </option>
                          ))}
                        </AppSelect>
                      </label>
                      <label>
                        {t("Assignee")}
                        <AppSelect
                          aria-label={t("Assignee")}
                          value={assigneeFilter}
                          onValueChange={(nextValue) =>
                            setAssigneeFilter(nextValue)
                          }
                        >
                          <option value="">{t("Anyone")}</option>
                          <option value="unassigned">{t("Unassigned")}</option>
                          {data.members.map((m) => (
                            <option key={m.email} value={m.email}>
                              {m.name}
                            </option>
                          ))}
                        </AppSelect>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={openOnly}
                          onChange={(event) => {
                            setOpenOnly(event.target.checked);
                            if (event.target.checked && statusFilter === "done")
                              setStatusFilter("");
                          }}
                        />
                        Open tasks only
                      </label>
                      <label>
                        Deadline
                        <AppSelect
                          aria-label="Deadline"
                          value={dueBucket}
                          onValueChange={(nextValue) => setDueBucket(nextValue)}
                        >
                          <option value="">Any deadline</option>
                          <option value="overdue">Past due</option>
                          <option value="upcoming">Upcoming</option>
                          <option value="today">Due today</option>
                          <option value="future">After today</option>
                          <option value="unscheduled">No deadline</option>
                        </AppSelect>
                      </label>
                      <button
                        className="text-link"
                        onClick={() => {
                          setDueBucket("");
                          setOpenOnly(false);
                          setStatusFilter("");
                          setPriorityFilter("");
                          setAssigneeFilter("");
                          setDateFrom("");
                          setDateTo("");
                          setDateMode("due");
                        }}
                      >
                        {t("Clear filters")}
                      </button>
                    </div>
                  )}
                  <div className="tasks-content">
                    {(!queryReady || queryLoading) && !queryError && (
                      <p className="query-status" role="status">
                        <Spinner />
                        {t("Memuat task…")}
                      </p>
                    )}
                    {queryError && (
                      <p className="form-error" role="alert">
                        {t(queryError)}{" "}
                        <button
                          className="text-link"
                          onClick={() =>
                            setTaskQueryRevision((revision) => revision + 1)
                          }
                        >
                          {t("Try again")}
                        </button>
                      </p>
                    )}
                    {!queryReady ? (
                      queryError ? null : (
                        <div className="task-loading-grid" aria-hidden="true">
                          {[1, 2, 3].map((row) => (
                            <div key={row} />
                          ))}
                        </div>
                      )
                    ) : page === "archive" || view === "list" ? (
                      <TaskList
                        key={page === "archive" ? "archive" : "active"}
                        {...shared}
                        tasks={tasks}
                      />
                    ) : view === "board" ? (
                      <TaskBoard {...shared} tasks={tasks} />
                    ) : (
                      <TaskCalendar {...shared} tasks={tasks} />
                    )}
                  </div>
                </>
              )}
              {(!demo && taskRoute
                ? queryReady && Boolean(serverPage?.nextCursor)
                : Boolean(data.nextCursor)) && (
                <div className="pagination-note">
                  <p>
                    {!demo &&
                    taskRoute &&
                    serverPage?.signature === queryParameters
                      ? t(
                          "{loaded} of {total} tasks shown. Search, statistics, and export cover the entire database.",
                          {
                            loaded: serverPage.tasks.length,
                            total: serverPage.total,
                          },
                        )
                      : t("{count} tasks loaded.", {
                          count: data.tasks.length,
                        })}
                  </p>
                  <button
                    className="button secondary"
                    disabled={loadingMore || queryLoading}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? <Spinner /> : <Plus size={14} />}
                    {t("Load more tasks")}
                  </button>
                </div>
              )}
              {page === "team" && (
                <PeopleManagement
                  {...shared}
                  onEdit={setEditingMember}
                  onInvite={() => setInviteOpen(true)}
                />
              )}
              {page === "inbox" && (
                <section className="inbox-section">
                  <div className="section-heading">
                    <h2>
                      {t("For your attention")}{" "}
                      <span className="count-badge">{unread}</span>
                    </h2>
                    {unread > 0 && (
                      <button
                        className="text-link"
                        onClick={async () => {
                          try {
                            await run({ action: "readNotifications" });
                            toast.success(t("All caught up"));
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <CheckCheck size={14} />
                        {t("Mark all as read")}
                      </button>
                    )}
                  </div>
                  {data.notifications.length === 0 ? (
                    <div className="panel">
                      <Empty
                        icon={<Inbox size={28} />}
                        title={t("A quiet inbox. A clear head.")}
                        description={t(
                          "New assignments and comments on your assigned tasks will appear here.",
                        )}
                      />
                    </div>
                  ) : (
                    <div className="panel notification-list">
                      {data.notifications.map((n) => (
                        <button
                          className={clsx(
                            "notification-row",
                            !n.read && "unread",
                          )}
                          key={n.id}
                          onClick={async () => {
                            try {
                              if (n.taskId) {
                                const task = demo
                                  ? data.tasks.find((t) => t.id === n.taskId)
                                  : await fetch(`/api/tasks/${n.taskId}`, {
                                      cache: "no-store",
                                    }).then(async (response) => {
                                      const result = await response.json();
                                      if (!response.ok)
                                        throw new Error(result.error);
                                      return result.task;
                                    });
                                if (task) openTask(task);
                              }
                              if (!n.read)
                                await run({
                                  action: "readNotification",
                                  id: n.id,
                                  read: true,
                                });
                            } catch (error) {
                              toast.error((error as Error).message);
                            }
                          }}
                        >
                          <div className="notification-icon">
                            <Bell size={16} />
                          </div>
                          <span>
                            <strong>{eventMessage(n.message, locale)}</strong>
                            <time>{relativeTime(new Date(n.createdAt))}</time>
                          </span>
                          {!n.read && <i />}
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {page === "activity" && <ActivityManagement {...shared} />}
              {page === "project" && currentProject && (
                <ProjectFinance
                  key={currentProject.id}
                  {...shared}
                  project={currentProject}
                />
              )}
              {page === "project" && currentProject && (
                <div
                  className="project-attachments panel"
                  id="project-documents"
                  tabIndex={-1}
                >
                  {data.canonicalProjects ? (
                    <CanonicalProjectDocuments
                      key={currentProject.id}
                      projectId={currentProject.id}
                      actorEmail={data.actor.email}
                      admin={data.actor.isAdmin}
                      demo={demo}
                      revision={data.revision}
                    />
                  ) : (
                    <Attachments
                      entityType={
                        data.canonicalProjects ? "boardRoomProject" : "project"
                      }
                      entityId={currentProject.id}
                      actorEmail={data.actor.email}
                      isAdmin={data.actor.isAdmin}
                      demo={demo}
                      revision={data.revision}
                    />
                  )}
                </div>
              )}
              {page === "templates" && (
                <RoomTemplates
                  room="locker"
                  templates={data.templates}
                  onNavigate={(section) => navigate(section as Page)}
                />
              )}
              {(page === "settings" || page === "files") && (
                <AccountSettings
                  key={page}
                  initialTab={page === "files" ? "files" : undefined}
                  fileRoom="locker"
                  onFilesRemoved={() => refresh(true)}
                  data={data}
                  run={run}
                  demo={demo}
                  onExport={exportTasks}
                  onLogout={requestLogout}
                />
              )}
            </>
          )}
        </main>
        <AppFooter />
      </div>
      {deletionTarget && (
        <DeleteEntityDialog
          key={`${deletionTarget.kind}:${deletionTarget.id}`}
          target={deletionTarget}
          run={run}
          onClose={() => {
            setDeletionTarget(null);
            requestAnimationFrame(() => {
              const target = deletionReturnFocus.current;
              if (target?.isConnected) target.focus({ preventScroll: true });
              else
                document
                  .querySelector<HTMLElement>("#main-content h1")
                  ?.focus({ preventScroll: true });
            });
          }}
          onDeleted={() => {
            setDeletionTarget(null);
            if (deletionTarget.kind === "project") {
              // Bypass task draft guards only after the explicit deletion succeeds.
              setTaskOpen(false);
              navigateTo("projects");
            } else if (selectedId === deletionTarget.id) {
              setTaskOpen(false);
              setSelectedId(null);
              const url = new URL(window.location.href);
              url.searchParams.delete("task");
              url.searchParams.delete("compose");
              window.history.replaceState(window.history.state, "", url);
              if (locationRef.current) locationRef.current.url = url.href;
              taskHistoryPushed.current = false;
            }
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>("#main-content h1")
                ?.focus({ preventScroll: true }),
            );
          }}
        />
      )}
      {projectOpen && (
        <ProjectDialog
          demo={demo}
          data={data}
          project={editProject}
          costsOnly={projectCostsOnly}
          onDocuments={(id) => {
            documentTargetRef.current = id;
            navigate("project", id);
          }}
          run={run}
          onClose={() => setProjectOpen(false)}
        />
      )}
      {inviteOpen && (
        <InviteDialog
          run={run}
          demo={demo}
          onClose={() => setInviteOpen(false)}
        />
      )}
      {editingMember && (
        <EditMemberDialog
          member={editingMember}
          run={run}
          onClose={() => setEditingMember(null)}
        />
      )}
      {searchOpen && (
        <SearchDialog
          data={data}
          demo={demo}
          onClose={() => setSearchOpen(false)}
          onSelect={openTask}
        />
      )}
      {batchDialog === "bulk" && (
        <BulkTaskDialog
          tasks={tasks}
          data={data}
          run={run}
          onClose={() => setBatchDialog(null)}
        />
      )}
      {batchDialog === "import" && (
        <ImportTaskDialog
          data={data}
          run={run}
          projectId={page === "project" ? projectId : undefined}
          onClose={() => setBatchDialog(null)}
        />
      )}
      <Modal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title={t("A little more in flow")}
        description={t("Your shortcuts to a calmer workday.")}
      >
        <div className="shortcuts">
          <div>
            <span>{t("Find a task")}</span>
            <span>
              <kbd>Ctrl</kbd>
              <kbd>F</kbd>
            </span>
          </div>
          <div>
            <span>{t("Create a task")}</span>
            <kbd aria-hidden="true">N</kbd>
          </div>
          <div>
            <span>{t("Keyboard shortcuts")}</span>
            <kbd>?</kbd>
          </div>
          <div>
            <span>{t("Close a dialog")}</span>
            <kbd>Esc</kbd>
          </div>
          <div>
            <span>{t("Save the open task")}</span>
            <kbd>⌘/Ctrl ↵</kbd>
          </div>
          <p className="muted small">
            {t(
              "Board cards can be dragged between columns. For keyboard and touch, use a card’s actions menu to change its status.",
            )}
          </p>
        </div>
      </Modal>
      <div className="sr-only" role="status" aria-live="polite">
        {busy ? t("Saving changes") : ""}
      </div>
    </div>
  );
}
