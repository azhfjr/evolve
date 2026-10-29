"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Folder,
  GitBranch,
  ListTodo,
  Search,
  Tag,
  Pencil,
} from "lucide-react";
import {
  connectionCatalogSchema,
  connectionItemsSchema,
  type ConnectionEntity,
} from "@/lib/connection-model";
import { displayLabel } from "@/lib/labels";
import { selectionAfterLabelEdit } from "@/lib/label-edit";
import type { Task, WorkspaceData } from "@/lib/types";
import { AppSelect } from "./app-select";
import { Empty, Spinner } from "./ui";
import { useConnectionData } from "./connection-data";
import { ConnectionLabelEditor } from "./connection-label-editor";
import type { RunCommand } from "./workspace-types";
import { ProjectTaskConnections } from "./connected/task-connections";
import { ConnectionTree } from "./connection-tree";

function Pager({
  page,
  next,
  onPrevious,
  onNext,
  label,
}: {
  page: number;
  next: boolean;
  onPrevious: () => void;
  onNext: () => void;
  label: string;
}) {
  return (
    <div className="connection-pagination" aria-label={`${label} pagination`}>
      <button
        className="button secondary small-button"
        aria-label={`Previous ${label}`}
        disabled={page === 0}
        onClick={onPrevious}
      >
        <ChevronLeft size={14} /> Previous
      </button>
      <span>Page {page + 1}</span>
      <button
        className="button secondary small-button"
        aria-label={`Next ${label}`}
        disabled={!next}
        onClick={onNext}
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
}
function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
}) {
  return loading ? (
    <p className="connection-loading" role="status">
      <Spinner /> Loading connections…
    </p>
  ) : error ? (
    <p className="form-error" role="alert">
      {error}{" "}
      <button className="text-link" onClick={retry}>
        Try again
      </button>
    </p>
  ) : null;
}
function LegacyConnections({
  data,
  demo,
  label,
  onSelect,
  onOpen,
  run,
}: {
  data: WorkspaceData;
  demo: boolean;
  run: RunCommand;
  label: string;
  onSelect: (label: string) => void;
  onOpen: (entity: ConnectionEntity, signal: AbortSignal) => Promise<void>;
}) {
  const [editing, setEditing] = useState<ConnectionEntity | null>(null);
  const region = useRef<HTMLElement>(null);
  const [focusAfterSave, setFocusAfterSave] = useState(0);
  useLayoutEffect(() => {
    if (focusAfterSave) region.current?.focus({ preventScroll: true });
  }, [focusAfterSave]);
  const canEdit = (item: ConnectionEntity) =>
    data.actor.isAdmin && item.kind === "project";
  const [search, setSearch] = useState(""),
    [itemSearch, setItemSearch] = useState(""),
    [type, setType] = useState("all"),
    [view, setView] = useState("map");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [catalogPages, setCatalogPages] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [itemPages, setItemPages] = useState<{
    scope: string;
    pages: (string | undefined)[];
  }>({ scope: "", pages: [undefined] });
  const [busy, setBusy] = useState(false),
    [openError, setOpenError] = useState("");
  const opening = useRef<AbortController | null>(null);
  const catalogParams = new URLSearchParams({
    mode: "catalog",
    q: search,
    limit: "24",
    includeArchived: String(includeArchived),
  });
  const catalogCursor = catalogPages.at(-1);
  if (catalogCursor) catalogParams.set("cursor", catalogCursor);
  const catalog = useConnectionData(
    data,
    demo,
    catalogParams,
    connectionCatalogSchema,
  );
  const selected = label || catalog.result?.groups[0]?.key || "";
  const scope = JSON.stringify([selected, itemSearch, type, includeArchived]);
  const pages = itemPages.scope === scope ? itemPages.pages : [undefined];
  const itemParams = new URLSearchParams({
    mode: "items",
    label: selected || "__no_label__",
    q: itemSearch,
    type,
    includeArchived: String(includeArchived),
    limit: "24",
  });
  const itemCursor = pages.at(-1);
  // Navigation within the same label must cancel pending opens as well.
  useEffect(() => () => opening.current?.abort(), [scope, itemCursor]);
  if (itemCursor) itemParams.set("cursor", itemCursor);
  const linked = useConnectionData(
    data,
    demo,
    itemParams,
    connectionItemsSchema,
    Boolean(selected),
  );
  const group = catalog.result?.groups.find((group) => group.key === selected);
  const title = group?.label || selected;
  async function open(item: ConnectionEntity) {
    if (busy) return;
    setOpenError("");
    setBusy(true);
    opening.current?.abort();
    const controller = new AbortController();
    opening.current = controller;
    try {
      await onOpen(item, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        setOpenError(
          error instanceof Error
            ? error.message
            : "This item could not be opened.",
        );
    } finally {
      if (opening.current === controller) setBusy(false);
    }
  }
  return (
    <section
      ref={region}
      tabIndex={-1}
      className="connections-page"
      aria-label="Workspace connections"
    >
      {editing && (
        <ConnectionLabelEditor
          key={`${editing.kind}:${editing.id}`}
          entity={editing}
          data={data}
          demo={demo}
          run={run}
          onSaved={(next, previous, renames) => {
            setCatalogPages([undefined]);
            setSearch("");
            setItemPages({ scope: "", pages: [undefined] });
            onSelect(
              selectionAfterLabelEdit(selected, previous, next, renames),
            );
            setFocusAfterSave((value) => value + 1);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="connection-intro">
        <GitBranch size={19} />
        <p>
          Shared labels bring related work together. Select a label, explore its
          branches, then open any project or task.
        </p>
        <label className="connection-archive-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
              setCatalogPages([undefined]);
            }}
          />{" "}
          Include archived tasks
        </label>
      </div>
      <div className="connection-layout">
        <aside
          className="connection-directory panel"
          aria-label="Connection labels"
        >
          <header>
            <h2>Labels</h2>
            <span>{catalog.result?.total ?? "…"}</span>
          </header>
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search connection labels"
              placeholder="Find a label…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCatalogPages([undefined]);
              }}
            />
          </label>
          <LoadState
            loading={catalog.loading}
            error={catalog.error}
            retry={catalog.retry}
          />
          <div className="connection-label-list">
            {catalog.result?.groups.map((group) => (
              <button
                className={group.key === selected ? "active" : ""}
                key={group.key}
                aria-pressed={group.key === selected}
                onClick={() => {
                  setItemSearch("");
                  setType("all");
                  onSelect(group.key);
                }}
              >
                <Tag size={14} />
                <span>
                  <strong>{displayLabel(group.label)}</strong>
                  <small>
                    {group.projectCount}{" "}
                    {group.projectCount === 1 ? "project" : "projects"} ·{" "}
                    {group.taskCount} {group.taskCount === 1 ? "task" : "tasks"}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          {catalog.result?.total === 0 && (
            <p className="connection-directory-empty">
              {search
                ? "No matching labels."
                : "Add labels to a project to begin."}
            </p>
          )}
          <Pager
            label="labels"
            page={catalogPages.length - 1}
            next={Boolean(catalog.result?.nextCursor)}
            onPrevious={() => setCatalogPages((pages) => pages.slice(0, -1))}
            onNext={() => {
              if (catalog.result?.nextCursor)
                setCatalogPages((pages) => [
                  ...pages,
                  catalog.result!.nextCursor!,
                ]);
            }}
          />
        </aside>
        <div
          className="connection-detail panel"
          aria-busy={busy || (selected ? linked.loading : catalog.loading)}
        >
          <header className="connection-detail-heading">
            <div>
              <span className="section-kicker">CONNECTED BY LABEL</span>
              <h2>{title ? displayLabel(title) : "Your workspace map"}</h2>
              <p>
                {selected && linked.result
                  ? `${linked.result.total} linked items · ${includeArchived ? "including archived tasks" : "archived tasks excluded"}`
                  : "Labels connect work across project boundaries."}
              </p>
            </div>
            <div
              className="view-tabs"
              role="tablist"
              aria-label="Connection view"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "map"
                    : event.key === "End"
                      ? "list"
                      : view === "map"
                        ? "list"
                        : "map";
                setView(next);
                event.currentTarget
                  .querySelector<HTMLButtonElement>(`[data-view="${next}"]`)
                  ?.focus();
              }}
            >
              {["map", "list"].map((value) => (
                <button
                  key={value}
                  role="tab"
                  data-view={value}
                  tabIndex={view === value ? 0 : -1}
                  aria-selected={view === value}
                  className={view === value ? "active" : ""}
                  onClick={() => setView(value)}
                >
                  {value === "map" ? "Map" : "List"}
                </button>
              ))}
            </div>
          </header>
          {selected && (
            <div className="connection-filters">
              <label className="search-field">
                <Search size={15} />
                <input
                  aria-label="Search linked items"
                  placeholder="Find linked work…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </label>
              <AppSelect
                aria-label="Connection item type"
                value={type}
                onValueChange={setType}
              >
                <option value="all">Projects and tasks</option>
                <option value="project">Projects only</option>
                <option value="task">Tasks only</option>
              </AppSelect>
            </div>
          )}
          {openError && (
            <p className="form-error" role="alert">
              {openError}
            </p>
          )}
          {busy && (
            <p role="status" className="connection-opening">
              <Spinner /> Opening linked work…
            </p>
          )}
          {selected ? (
            <>
              <LoadState
                loading={linked.loading}
                error={linked.error}
                retry={linked.retry}
              />
              {linked.result?.items.length ? (
                view === "map" ? (
                  <ConnectionTree
                    key={selected}
                    label={title}
                    items={linked.result.items}
                    parents={linked.result.parents}
                    total={linked.result.total}
                    onOpen={(item) => void open(item)}
                    busy={busy}
                    onEdit={setEditing}
                    canEdit={canEdit}
                  />
                ) : (
                  <ul
                    className="connection-item-list"
                    aria-label="Linked projects and tasks"
                  >
                    {linked.result.items.map((item) => (
                      <li key={`${item.kind}:${item.id}`}>
                        <button disabled={busy} onClick={() => void open(item)}>
                          {item.kind === "project" ? (
                            <Folder size={17} />
                          ) : (
                            <ListTodo size={17} />
                          )}
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {item.kind} ·{" "}
                              {item.archived
                                ? "Archived"
                                : item.status.replaceAll("_", " ")}
                            </small>
                          </span>
                          <ArrowRight size={15} />
                        </button>
                        {canEdit(item) && (
                          <button
                            className="connection-list-edit icon-button"
                            type="button"
                            aria-label={`Edit labels for ${item.title}`}
                            disabled={busy}
                            onClick={() => setEditing(item)}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                !linked.loading &&
                !linked.error && (
                  <Empty
                    icon={<GitBranch />}
                    title="No linked items"
                    description="Try another label or clear the search and type filter."
                  />
                )
              )}
              {linked.result && (
                <>
                  <p className="connection-page-count">
                    {linked.result.items.length
                      ? `${(pages.length - 1) * 24 + 1}–${(pages.length - 1) * 24 + linked.result.items.length} of ${linked.result.total}`
                      : "0 items"}
                  </p>
                  <Pager
                    label="items"
                    page={pages.length - 1}
                    next={Boolean(linked.result.nextCursor)}
                    onPrevious={() =>
                      setItemPages({ scope, pages: pages.slice(0, -1) })
                    }
                    onNext={() => {
                      if (linked.result?.nextCursor)
                        setItemPages({
                          scope,
                          pages: [...pages, linked.result.nextCursor],
                        });
                    }}
                  />
                </>
              )}
            </>
          ) : catalog.loading ? (
            <LoadState loading retry={catalog.retry} />
          ) : (
            <Empty
              icon={<GitBranch />}
              title="A shared label starts a connection"
              description="Add the same label to related projects. Their tasks join this map automatically."
            />
          )}
        </div>
      </div>
    </section>
  );
}
export function ConnectionOverview({
  data,
  demo,
  onExplore,
  onProject,
  openTask,
  run,
}: {
  data: WorkspaceData;
  demo: boolean;
  run: RunCommand;
  onExplore: (label?: string) => void;
  onProject: (id: string) => void;
  openTask: (task: Task) => void;
}) {
  const [editing, setEditing] = useState<ConnectionEntity | null>(null);
  const region = useRef<HTMLElement>(null);
  const [focusAfterSave, setFocusAfterSave] = useState(0);
  useLayoutEffect(() => {
    if (focusAfterSave) region.current?.focus({ preventScroll: true });
  }, [focusAfterSave]);
  const [catalogPages, setCatalogPages] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [itemPages, setItemPages] = useState<{
    label: string;
    pages: (string | undefined)[];
  }>({ label: "", pages: [undefined] });
  const [busy, setBusy] = useState(false),
    [openError, setOpenError] = useState("");
  const opening = useRef<AbortController | null>(null);
  const catalogParams = new URLSearchParams({ mode: "catalog", limit: "24" });
  const catalogCursor = catalogPages.at(-1);
  if (catalogCursor) catalogParams.set("cursor", catalogCursor);
  const catalog = useConnectionData(
    data,
    demo,
    catalogParams,
    connectionCatalogSchema,
  );
  const selected = selectedLabel || catalog.result?.groups[0]?.key || "";
  const pages = itemPages.label === selected ? itemPages.pages : [undefined];
  const itemParams = new URLSearchParams({
    mode: "items",
    label: selected || "__no_label__",
    limit: "12",
  });
  const itemCursor = pages.at(-1);
  if (itemCursor) itemParams.set("cursor", itemCursor);
  const linked = useConnectionData(
    data,
    demo,
    itemParams,
    connectionItemsSchema,
    Boolean(selected),
  );
  const label =
    catalog.result?.groups.find((g) => g.key === selected)?.label || selected;
  useEffect(() => {
    const active = opening.current;
    return () => {
      active?.abort();
      opening.current?.abort();
    };
  }, [selected, itemCursor]);
  async function open(entity: ConnectionEntity) {
    if (busy) return;
    setBusy(true);
    setOpenError("");
    const controller = new AbortController();
    opening.current?.abort();
    opening.current = controller;
    try {
      if (entity.kind === "project") {
        onProject(entity.id);
        return;
      }
      let task = data.tasks.find((t) => t.id === entity.id);
      if (!task && !demo) {
        const response = await fetch(
          `/api/tasks/${encodeURIComponent(entity.id)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "This task could not be opened.");
        task = result.task;
      }
      if (!task || task.id !== entity.id)
        throw new Error(
          "This task is no longer available. Refresh the map and try again.",
        );
      if (!controller.signal.aborted) openTask(task);
    } catch (error) {
      if (!controller.signal.aborted)
        setOpenError(
          error instanceof Error
            ? error.message
            : "This item could not be opened.",
        );
    } finally {
      if (opening.current === controller) setBusy(false);
    }
  }
  function changeCatalog(next: (string | undefined)[]) {
    setSelectedLabel("");
    setCatalogPages(next);
    setOpenError("");
  }
  return (
    <section
      ref={region}
      tabIndex={-1}
      className="connection-overview overview-connection-map panel"
      aria-label="Connection overview"
    >
      {editing && (
        <ConnectionLabelEditor
          key={`${editing.kind}:${editing.id}`}
          entity={editing}
          data={data}
          demo={demo}
          run={run}
          onSaved={(next, previous, renames) => {
            const selection = selectionAfterLabelEdit(
              selected,
              previous,
              next,
              renames,
            );
            setCatalogPages([undefined]);
            setSelectedLabel(selection);
            setItemPages({ label: selection, pages: [undefined] });
            setFocusAfterSave((value) => value + 1);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <header>
        <div>
          <span className="section-kicker">CONNECTED WORK</span>
          <h2>Connection</h2>
          <p>Explore how project labels connect your projects and tasks.</p>
        </div>
        <button
          className="text-link"
          onClick={() => onExplore(selected || undefined)}
        >
          Explore map <ArrowRight size={14} />
        </button>
      </header>
      <LoadState
        loading={catalog.loading}
        error={catalog.error}
        retry={catalog.retry}
      />
      {catalog.result?.groups.length ? (
        <>
          <div className="overview-map-selector">
            <label>
              <Tag size={14} />
              <span>Label</span>
              <AppSelect
                aria-label="Overview connection label"
                value={selected}
                onValueChange={(value) => {
                  setSelectedLabel(value);
                  setItemPages({ label: value, pages: [undefined] });
                  setOpenError("");
                }}
              >
                {selected &&
                  !catalog.result.groups.some(
                    (group) => group.key === selected,
                  ) && (
                    <option value={selected}>{displayLabel(selected)}</option>
                  )}
                {catalog.result.groups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {displayLabel(group.label)}
                  </option>
                ))}
              </AppSelect>
            </label>
            <span>{catalog.result.total} labels in workspace</span>
          </div>
          {(catalogPages.length > 1 || catalog.result.nextCursor) && (
            <Pager
              label="overview labels"
              page={catalogPages.length - 1}
              next={Boolean(catalog.result.nextCursor)}
              onPrevious={() => changeCatalog(catalogPages.slice(0, -1))}
              onNext={() =>
                changeCatalog([...catalogPages, catalog.result!.nextCursor!])
              }
            />
          )}
          <LoadState
            loading={linked.loading}
            error={linked.error}
            retry={linked.retry}
          />
          {openError && (
            <p className="form-error" role="alert">
              {openError}
            </p>
          )}
          {linked.result && (
            <>
              <ConnectionTree
                key={selected}
                label={label}
                items={linked.result.items}
                parents={linked.result.parents}
                total={linked.result.total}
                onOpen={(item) => void open(item)}
                busy={busy}
                onEdit={setEditing}
                canEdit={(item) =>
                  data.actor.isAdmin && item.kind === "project"
                }
              />
              <div className="overview-map-footer">
                <span className="overview-map-count">
                  Showing {linked.result.items.length} of {linked.result.total}{" "}
                  connections. Context projects may also appear.
                </span>
                <button
                  className="text-link"
                  onClick={() => onExplore(selected)}
                >
                  Open full Connection <ArrowRight size={14} />
                </button>
              </div>
              {(pages.length > 1 || linked.result.nextCursor) && (
                <Pager
                  label="overview connections"
                  page={pages.length - 1}
                  next={Boolean(linked.result.nextCursor)}
                  onPrevious={() =>
                    setItemPages({ label: selected, pages: pages.slice(0, -1) })
                  }
                  onNext={() =>
                    setItemPages({
                      label: selected,
                      pages: [...pages, linked.result!.nextCursor!],
                    })
                  }
                />
              )}
            </>
          )}
          <div
            className="overview-connection-shortcuts"
            aria-label="Explore label connections"
          >
            {catalog.result.groups.slice(0, 3).map((group) => (
              <button
                key={group.key}
                className="text-link"
                onClick={() => onExplore(group.key)}
                aria-label={`Explore ${displayLabel(group.label)} connections`}
              >
                {displayLabel(group.label)} <ArrowRight size={12} />
              </button>
            ))}
          </div>
        </>
      ) : (
        !catalog.loading &&
        !catalog.error && (
          <p className="connection-empty-note">
            Add labels to projects. Their tasks join the same connections
            automatically.
          </p>
        )
      )}
    </section>
  );
}

export function Connections(props: Parameters<typeof LegacyConnections>[0]) {
  return props.data.canonicalProjects ? (
    <ProjectTaskConnections data={props.data} onOpen={props.onOpen} />
  ) : (
    <LegacyConnections {...props} />
  );
}
