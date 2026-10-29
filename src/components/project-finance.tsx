"use client";
import { displayLabel } from "@/lib/labels";
import { AppSelect } from "./app-select";
import { useState } from "react";
import { ArrowUpRight, FolderOpen, Plus, Search } from "lucide-react";
import type { Project } from "@/lib/types";
import {
  projectCostOptions,
  costUnitTotals,
  formatCostAmount,
  PROJECT_CATEGORIES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
} from "@/lib/project-model";
import type { SharedProps } from "./workspace-types";
import { Empty } from "./ui";
import { ProjectChecklist } from "./project-checklist";
export function ProjectPortfolio({
  data,
  onProject,
  onCreate,
}: SharedProps & { onProject: (id: string) => void; onCreate: () => void }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [view, setView] = useState<"cards" | "checklist">("cards");
  const projects = data.projects.filter(
    (p) =>
      (!status || (p.status || "active") === status) &&
      (!category || p.category === category) &&
      `${p.name} ${p.description} ${p.reference} ${p.location} ${p.category || ""} ${p.plannedCodYear ?? ""} ${(p.labels || []).join(" ")} ${projectCostOptions(
        p,
      )
        .flatMap((option) => [
          option.title,
          ...option.items.map((item) => item.title),
        ])
        .join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="portfolio-page">
      <div className="management-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search projects"
            placeholder={
              data.canonicalProjects
                ? "Search Board projects or COD year"
                : "Search projects, options, costs, or COD year"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <AppSelect
          aria-label="Project status"
          value={status}
          onValueChange={(nextValue) => setStatus(nextValue)}
        >
          <option value="">All project statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABEL[s]}
            </option>
          ))}
        </AppSelect>
        <AppSelect
          aria-label="Project category"
          value={category}
          onValueChange={setCategory}
        >
          <option value="">All project categories</option>
          {PROJECT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </AppSelect>
        {data.actor.isAdmin && !data.canonicalProjects && (
          <button className="button primary" onClick={onCreate}>
            <Plus size={16} />
            New project
          </button>
        )}
      </div>
      <div className="portfolio-view-bar">
        <p className="portfolio-result-count" role="status">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </p>
        <div
          className="portfolio-view-switch"
          role="group"
          aria-label="Project view"
        >
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "checklist"}
            onClick={() => setView("checklist")}
          >
            Checklist
          </button>
        </div>
      </div>
      {!projects.length ? (
        <Empty
          icon={<FolderOpen />}
          title="No matching projects"
          description="Adjust your search or create a project to start planning."
        />
      ) : view === "checklist" ? (
        <ProjectChecklist projects={projects} onProject={onProject} />
      ) : (
        <div className="portfolio-grid">
          {projects.map((p) => {
            const stats = data.stats?.byProject[p.id];
            const tasks = data.tasks.filter(
              (t) => !t.archived && t.projectId === p.id,
            );
            const total = stats?.total ?? tasks.length,
              done =
                stats?.completed ??
                tasks.filter((t) => t.status === "done").length;
            return (
              <button
                className="portfolio-card panel"
                key={p.id}
                onClick={() => onProject(p.id)}
              >
                <div className="portfolio-card-top">
                  <span className={`project-icon color-${p.color}`}>
                    {p.name[0]}
                  </span>
                  <span className="pill gray">
                    {PROJECT_STATUS_LABEL[p.status || "active"]}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
                <small>{p.reference || "PROJECT"}</small>
                <h2>{p.name}</h2>
                <p>
                  {p.description ||
                    "Add a project description to align the team."}
                </p>
                {Boolean(p.labels?.length) && (
                  <div className="portfolio-labels">
                    {p.labels!.slice(0, 3).map((label) => (
                      <span key={label}>{displayLabel(label)}</span>
                    ))}
                    {p.labels!.length > 3 && (
                      <span>+{p.labels!.length - 3}</span>
                    )}
                  </div>
                )}
                <div className="portfolio-meta">
                  <span>
                    {data.members.find((m) => m.email === p.ownerEmail)?.name ||
                      "Owner unassigned"}
                  </span>
                  <span>{p.targetDate || "No target date"}</span>
                </div>
                {p.category && (
                  <span className="project-category-badge">{p.category}</span>
                )}
                {p.plannedCodYear != null && (
                  <span className="portfolio-cod-year">
                    Planned COD {p.plannedCodYear}
                  </span>
                )}
                <progress max={Math.max(1, total)} value={done} />
                <div className="portfolio-meta">
                  <span>
                    {done}/{total} tasks completed
                  </span>
                  <strong>
                    {total ? Math.round((done / total) * 100) : 0}%
                  </strong>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function ProjectFinance({
  project,
  data,
  onEditCosts,
}: SharedProps & { project: Project; onEditCosts?: () => void }) {
  const options = projectCostOptions(project);
  return (
    <section className="project-finance panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">PROJECT COSTS</span>
          <h2>Cost</h2>
          <p>
            Review each option independently. Each currency and energy rate has
            its own total within that option.
          </p>
        </div>
      </div>
      <div className="project-finance-content">
        <div className="cost-breakdown-heading">
          <h3>
            Cost breakdown{" "}
            <span>
              {options.reduce(
                (count, option) => count + option.items.length,
                0,
              )}{" "}
              items · {options.length} options
            </span>
          </h3>
          {data.actor.isAdmin && onEditCosts && (
            <button className="text-link" onClick={onEditCosts}>
              Manage costs
            </button>
          )}
        </div>
        {options.length ? (
          <div className="project-cost-options">
            {options.map((option) => (
              <section className="cost-option-summary" key={option.id}>
                <header>
                  <h4>{option.title}</h4>
                  <span>
                    {option.items.length}{" "}
                    {option.items.length === 1 ? "item" : "items"}
                  </span>
                </header>
                {option.items.length ? (
                  <ul className="project-cost-breakdown">
                    {option.items.map((item) => (
                      <li key={item.id}>
                        <span>{item.title}</span>
                        <small>{item.unit}</small>
                        <strong>
                          {formatCostAmount(item.amount, item.unit)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cost-empty-note">
                    No cost items in this option.
                  </p>
                )}
                {option.items.length > 0 && (
                  <div
                    className="cost-option-totals"
                    aria-label={`${option.title} totals`}
                  >
                    <span>Option total</span>
                    {costUnitTotals(option.items).map((total) => (
                      <strong key={total.unit} data-unit={total.unit}>
                        {formatCostAmount(total.amount, total.unit)}
                      </strong>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <p className="cost-empty-note">
            No costs recorded. Project costs are managed in Board Room.
          </p>
        )}
      </div>
    </section>
  );
}
