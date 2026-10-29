"use client";
import { AppSelect } from "./app-select";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  Copy,
  Search,
  ShieldCheck,
  Users,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Activity, Member, Task } from "@/lib/types";
import { eventMessage } from "@/lib/i18n/events";
import type { SharedProps } from "./workspace-types";
import { Avatar, Empty, Modal, Spinner } from "./ui";
export function ActivityManagement({
  data,
  openTask,
  demo,
  run,
  room = "locker",
  onProject,
}: SharedProps & {
  room?: "locker" | "board";
  onProject?: (id: string) => void;
}) {
  const endpoint =
    room === "board" ? "/api/board-room/activity" : "/api/activity";
  const [selected, setSelected] = useState<Map<string, Activity>>(new Map());
  const [confirm, setConfirm] = useState<Activity[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const activityEpoch = useRef(0);
  const [filters, setFilters] = useState({
      q: "",
      actor: "",
      projectId: "",
      kind: "all",
      scope: data.profile?.preferences.activityScope || "workspace",
      from: "",
      to: "",
    }),
    [result, setResult] = useState<{
      activities: Activity[];
      total: number;
      nextCursor: string | null;
      signature: string;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  function updateFilters(next: typeof filters) {
    setSelected(new Map());
    setFilters(next);
  }
  const parameters = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => !!v),
  ).toString();
  const queryRevision = `${parameters}|${data.revision || 0}`;
  const latestParameters = useRef(queryRevision);
  useEffect(() => {
    latestParameters.current = queryRevision;
  }, [queryRevision]);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const epoch = activityEpoch.current;
    const timer = setTimeout(() => {
      fetch(`${endpoint}?${parameters}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          return b;
        })
        .then((b) => {
          if (!controller.signal.aborted && epoch === activityEpoch.current) {
            setResult({ ...b, signature: parameters });
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [demo, parameters, data.revision, retry, endpoint]);
  const activities = useMemo(
    () =>
      demo
        ? data.activities.filter(
            (a) =>
              (filters.scope !== "mine" || a.actor === data.actor.email) &&
              (!filters.actor || a.actor === filters.actor) &&
              (!filters.projectId ||
                (a.projectId ||
                  data.tasks.find((t) => t.id === a.taskId)?.projectId) ===
                  filters.projectId) &&
              (filters.kind === "all" || a.kind === filters.kind) &&
              (!filters.from || a.createdAt.slice(0, 10) >= filters.from) &&
              (!filters.to || a.createdAt.slice(0, 10) <= filters.to) &&
              `${a.message} ${a.actor}`
                .toLowerCase()
                .includes(filters.q.toLowerCase()),
          )
        : result?.signature === parameters
          ? result.activities
          : [],
    [demo, data, filters, result, parameters],
  );
  const pending = !demo && result?.signature !== parameters;
  async function more() {
    if (!result?.nextCursor || result.signature !== parameters || loading)
      return;
    setLoading(true);
    const epoch = activityEpoch.current;
    try {
      const r = await fetch(
        `${endpoint}?${parameters}&cursor=${encodeURIComponent(result.nextCursor)}`,
        { cache: "no-store" },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (
        latestParameters.current !== queryRevision ||
        epoch !== activityEpoch.current
      )
        return;
      setResult((current) =>
        current?.signature === parameters
          ? {
              ...b,
              signature: parameters,
              activities: [
                ...new Map<string, Activity>(
                  [...current.activities, ...b.activities].map(
                    (item: Activity) => [item.id, item],
                  ),
                ).values(),
              ],
            }
          : current,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function removeActivities() {
    if (!confirm || removing) return;
    setRemoving(true);
    setRemoveError("");
    activityEpoch.current++;
    try {
      await run({ action: "deleteActivities", ids: confirm.map((a) => a.id) });
      const ids = new Set(confirm.map((a) => a.id));
      setResult((previous) =>
        previous
          ? {
              ...previous,
              activities: previous.activities.filter((a) => !ids.has(a.id)),
              total: Math.max(
                0,
                previous.total -
                  previous.activities.filter((a) => ids.has(a.id)).length,
              ),
            }
          : null,
      );
      setSelected(new Map());
      setConfirm(null);
      setRetry((n) => n + 1);
      toast.success("Activity entries removed");
    } catch (error) {
      setRemoveError(
        error instanceof Error
          ? error.message
          : "Activities could not be removed. Please try again.",
      );
      setRetry((n) => n + 1);
    } finally {
      setRemoving(false);
    }
  }
  async function inspect(id: string) {
    try {
      let task = data.tasks.find((t) => t.id === id);
      if (!task && !demo) {
        const r = await fetch(`/api/tasks/${id}`, { cache: "no-store" });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        task = b.task as Task;
      }
      if (task) openTask(task);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <section className="activity-management">
      <div className="activity-controls" aria-label="Activity filters">
        <div className="management-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search activity"
              placeholder="Search updates or email"
              value={filters.q}
              onChange={(e) => updateFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <AppSelect
            aria-label="Activity scope"
            value={filters.scope}
            onValueChange={(nextValue) =>
              updateFilters({
                ...filters,
                scope: nextValue as "workspace" | "mine",
              })
            }
          >
            <option value="workspace">Workspace activity</option>
            <option value="mine">My activity</option>
          </AppSelect>
          <AppSelect
            aria-label="Activity type"
            value={filters.kind}
            onValueChange={(nextValue) =>
              updateFilters({ ...filters, kind: nextValue })
            }
          >
            {(room === "board"
              ? ["all", "project", "progress", "documents", "review"]
              : [
                  "all",
                  "task",
                  "project",
                  "member",
                  "settings",
                  "finance",
                  "calendar",
                ]
            ).map((k) => (
              <option key={k} value={k}>
                {k === "all" ? "All update types" : k}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="filter-bar activity-filters">
          <label>
            Person
            <AppSelect
              aria-label={"Person"}
              value={filters.actor}
              disabled={filters.scope === "mine"}
              onValueChange={(nextValue) =>
                updateFilters({ ...filters, actor: nextValue })
              }
            >
              <option value="">Everyone</option>
              {data.members.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name}
                </option>
              ))}
            </AppSelect>
          </label>
          <label>
            Project
            <AppSelect
              aria-label={"Project"}
              value={filters.projectId}
              onValueChange={(nextValue) =>
                updateFilters({ ...filters, projectId: nextValue })
              }
            >
              <option value="">All projects</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </AppSelect>
          </label>
          <label>
            From
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) =>
                updateFilters({ ...filters, from: e.target.value })
              }
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) =>
                updateFilters({ ...filters, to: e.target.value })
              }
            />
          </label>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {room === "board" ? "Board Room journal" : "Locker Room journal"}
            </h2>
            <p>
              {demo
                ? activities.length
                : result?.signature === parameters
                  ? result.total
                  : "…"}{" "}
              matching updates · dates shown in{" "}
              {data.profile?.timeZone || "Asia/Jakarta"}
            </p>
          </div>
          <ActivityIcon size={20} />
        </div>
        {data.actor.isAdmin && (
          <div className="activity-selection-bar">
            <label>
              <input
                type="checkbox"
                aria-label="Select all loaded activities"
                disabled={!activities.length || removing}
                checked={
                  !!activities.length &&
                  activities.every((a) => selected.has(a.id))
                }
                onChange={(event) => {
                  if (!event.target.checked) setSelected(new Map());
                  else if (activities.length <= 100)
                    setSelected(new Map(activities.map((a) => [a.id, a])));
                  else toast.error("Select up to 100 activities at a time.");
                }}
              />
              <span>
                {selected.size ? `${selected.size} selected` : "Select updates"}
              </span>
            </label>
            {selected.size > 0 && (
              <button
                className="text-link"
                disabled={removing}
                onClick={() => setSelected(new Map())}
              >
                Clear
              </button>
            )}
            <button
              className="button secondary small-button danger-text"
              disabled={!selected.size || removing}
              onClick={() => {
                setRemoveError("");
                setConfirm([...selected.values()]);
              }}
            >
              <Trash2 size={14} />
              Delete selected
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}{" "}
            <button
              className="text-link"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          </p>
        )}
        {pending && !error ? (
          <p className="query-status">
            <Spinner />
            Loading activity…
          </p>
        ) : !activities.length ? (
          <Empty
            icon={<ActivityIcon />}
            title="No matching updates"
            description="Try another person, project, or date range."
          />
        ) : (
          activities.map((a) => {
            const member = data.members.find((m) => m.email === a.actor);
            return (
              <article
                className="activity-row"
                data-manageable={data.actor.isAdmin}
                data-selected={selected.has(a.id)}
                data-activity-id={a.id}
                key={a.id}
              >
                {data.actor.isAdmin && (
                  <input
                    type="checkbox"
                    aria-label={`Select activity: ${a.message}`}
                    checked={selected.has(a.id)}
                    disabled={
                      removing || (!selected.has(a.id) && selected.size >= 100)
                    }
                    onChange={() =>
                      setSelected((previous) => {
                        const next = new Map(previous);
                        if (next.has(a.id)) next.delete(a.id);
                        else if (next.size < 100) next.set(a.id, a);
                        return next;
                      })
                    }
                  />
                )}
                <Avatar name={member?.name || a.actor} color={member?.color} />
                <div>
                  <p>
                    <strong>{member?.name || a.actor}</strong>{" "}
                    {a.taskId ? (
                      <button onClick={() => void inspect(a.taskId!)}>
                        {eventMessage(a.message, "en")}
                      </button>
                    ) : onProject && a.projectId ? (
                      <button onClick={() => onProject(a.projectId!)}>
                        {eventMessage(a.message, "en")}
                      </button>
                    ) : (
                      eventMessage(a.message, "en")
                    )}
                  </p>
                  <div className="activity-meta">
                    <time dateTime={a.createdAt}>
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: data.profile?.timeZone || "Asia/Jakarta",
                      }).format(new Date(a.createdAt))}
                    </time>
                    <small className="activity-kind">
                      {a.kind || (a.taskId ? "task" : "general")}
                    </small>
                  </div>
                </div>
                {data.actor.isAdmin && (
                  <button
                    type="button"
                    className="icon-button activity-delete danger-text"
                    aria-label={`Delete activity: ${a.message}`}
                    disabled={removing}
                    onClick={() => {
                      setRemoveError("");
                      setConfirm([a]);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            );
          })
        )}
        {!demo && result?.nextCursor && (
          <div className="pagination-note">
            <button
              className="button secondary"
              disabled={loading || removing}
              onClick={() => void more()}
            >
              {loading ? <Spinner /> : "Load more updates"}
            </button>
          </div>
        )}
      </div>
      {confirm && (
        <Modal
          open
          title={
            confirm.length === 1
              ? "Delete this activity?"
              : `Delete ${confirm.length} activities?`
          }
          description="Permanently remove these journal entries. Tasks, projects, files and comments are kept."
          onClose={() => {
            if (!removing) setConfirm(null);
          }}
        >
          <ul
            className="activity-delete-preview"
            tabIndex={0}
            aria-label="Activities to delete"
          >
            {confirm.slice(0, 3).map((a) => (
              <li key={a.id}>{eventMessage(a.message, "en")}</li>
            ))}
            {confirm.length > 3 && (
              <li>And {confirm.length - 3} more entries</li>
            )}
          </ul>
          {removeError && (
            <p className="form-error" role="alert">
              {removeError}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={removing}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button danger"
              disabled={removing}
              onClick={() => void removeActivities()}
            >
              {removing ? <Spinner /> : <Trash2 size={15} />}Delete{" "}
              {confirm.length === 1
                ? "activity"
                : `${confirm.length} activities`}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
type AdminReport = {
  sessions: {
    email: string;
    activeSessions: number;
    accountRegistered: boolean;
    lastSeenAt: string | null;
  }[];
  calendar: { email: string; connected: boolean; errorCode: string | null }[];
  queue: { email: string; pending: number; failed: number }[];
};
export function PeopleManagement({
  data,
  run,
  demo,
  onEdit,
  room = "locker",
}: SharedProps & {
  onEdit: (m: Member) => void;
  onInvite: () => void;
  room?: "locker" | "board";
}) {
  const [query, setQuery] = useState(""),
    [access, setAccess] = useState(""),
    [report, setReport] = useState<AdminReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo || !data.actor.isAdmin) return;
    const controller = new AbortController();
    fetch("/api/administration", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        return b;
      })
      .then(setReport)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [demo, data.actor.isAdmin, data.revision, data.members, retry]);
  const members = data.members.filter(
    (m) =>
      (!access || (access === "disabled" ? m.disabled : !m.disabled)) &&
      `${m.name} ${m.email} ${m.jobTitle}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function command(m: Member, sessions = false) {
    if (busy) return;
    if (
      !confirm(
        sessions
          ? `Sign ${m.name} out on all devices? They can sign in again while access remains active.`
          : `${m.disabled ? "Restore" : "Revoke"} ${m.name}’s workspace access? Existing tasks and comments are preserved.`,
      )
    )
      return;
    setBusy(m.email);
    try {
      await run(
        sessions
          ? { action: "revokeMemberSessions", email: m.email }
          : {
              action: "setMemberAccess",
              email: m.email,
              disabled: !m.disabled,
            },
      );
      toast.success(
        sessions
          ? "Sessions revoked"
          : m.disabled
            ? "Access restored"
            : "Access revoked",
      );
      setRetry((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <div className="people-summary">
        <div className="stat-icon green">
          <Users size={21} />
        </div>
        <div>
          <strong>
            {data.members.filter((m) => !m.disabled).length} active people
          </strong>
          <p>
            Invite-only access. {data.adminEmail} is the sole administrator.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            void navigator.clipboard
              .writeText(window.location.origin + "/")
              .then(
                () => toast.success("Sign-in link copied"),
                () => toast.error("Could not access clipboard"),
              )
          }
        >
          <Copy size={16} />
          Copy sign-in link
        </button>
      </div>
      <div className="management-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search people"
            placeholder="Search name, email, or job title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <AppSelect
          aria-label="Member access"
          value={access}
          onValueChange={(nextValue) => setAccess(nextValue)}
        >
          <option value="">All people</option>
          <option value="active">Active</option>
          <option value="disabled">Deactivated</option>
        </AppSelect>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <div className="people-grid">
        {members.map((m) => {
          const admin = m.email === data.adminEmail,
            s = report?.sessions.find((s) => s.email === m.email),
            calendar = report?.calendar.find((c) => c.email === m.email),
            queue = report?.queue.find((q) => q.email === m.email);
          return (
            <article
              key={m.email}
              className={`person-card ${m.disabled ? "person-disabled" : ""}`}
            >
              <div className="person-top">
                <Avatar
                  name={m.name}
                  color={m.color}
                  image={
                    m.avatarId ? `/api/attachments/${m.avatarId}/content` : null
                  }
                />
                <span
                  className={`pill ${m.disabled ? "gray" : admin ? "violet" : "green"}`}
                >
                  {m.disabled
                    ? "Deactivated"
                    : admin
                      ? "Administrator"
                      : "Member"}
                </span>
              </div>
              <h2>
                {m.name}
                {m.email === data.actor.email && <small> (you)</small>}
              </h2>
              <p>{m.email}</p>
              {m.jobTitle && <p>{m.jobTitle}</p>}
              <div className="member-insights">
                <span>
                  <ShieldCheck size={14} />
                  {room === "board" ? (
                    "Project monitoring access"
                  ) : (
                    <>
                      {data.stats?.byMember[m.email] ??
                        data.tasks.filter(
                          (t) =>
                            !t.archived &&
                            t.status !== "done" &&
                            t.assignee === m.email,
                        ).length}{" "}
                      open tasks
                    </>
                  )}
                </span>
                {data.actor.isAdmin && !demo && (
                  <>
                    <span>
                      {m.disabled
                        ? "Access revoked"
                        : !s
                          ? "Account status unavailable"
                          : !s.accountRegistered
                            ? "Approved · Account not registered"
                            : s.activeSessions
                              ? "Has active sessions"
                              : "Account registered · No active sessions"}
                    </span>
                    <span>{s?.activeSessions ?? "—"} active sessions</span>
                    {room === "locker" && (
                      <span>
                        Calendar:{" "}
                        {calendar?.errorCode
                          ? "Needs attention"
                          : calendar?.connected
                            ? "Connected"
                            : "Not connected"}
                        {queue?.pending ? ` · ${queue.pending} queued` : ""}
                      </span>
                    )}
                    <span>
                      Last session:{" "}
                      {s?.lastSeenAt
                        ? new Intl.DateTimeFormat("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: data.profile?.timeZone || "Asia/Jakarta",
                          }).format(
                            new Date(
                              s.lastSeenAt +
                                (/Z|[+-]\d\d:\d\d$/.test(s.lastSeenAt)
                                  ? ""
                                  : "Z"),
                            ),
                          )
                        : "No session recorded"}
                    </span>
                  </>
                )}
              </div>
              {data.actor.isAdmin && (
                <footer>
                  <button className="text-link" onClick={() => onEdit(m)}>
                    Edit profile
                  </button>
                  {!admin && (
                    <button
                      className="text-link"
                      disabled={!!busy}
                      onClick={() => void command(m)}
                    >
                      {m.disabled ? "Restore access" : "Revoke access"}
                    </button>
                  )}
                  {m.email !== data.actor.email && !demo && (
                    <button
                      className="text-link"
                      disabled={!!busy}
                      onClick={() => void command(m, true)}
                    >
                      Sign out all devices
                    </button>
                  )}
                </footer>
              )}
            </article>
          );
        })}
      </div>
      {!members.length && (
        <Empty
          icon={<Users />}
          title="No matching people"
          description="Try another name or access filter."
        />
      )}
    </section>
  );
}
