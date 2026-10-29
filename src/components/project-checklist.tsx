"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { Project } from "@/lib/types";
import {
  costUnitTotals,
  formatCostAmount,
  projectCostOptions,
  PROJECT_STATUS_LABEL,
  type CostUnit,
} from "@/lib/project-model";

function UnitTotals({
  totals,
  className = "",
}: {
  totals: { unit: CostUnit; amount: string }[];
  className?: string;
}) {
  return (
    <div className={`checklist-unit-totals ${className}`}>
      {totals.map((total) => (
        <strong key={total.unit} data-unit={total.unit}>
          {formatCostAmount(total.amount, total.unit)}
        </strong>
      ))}
    </div>
  );
}

export function ProjectChecklist({
  projects,
  onProject,
}: {
  projects: Project[];
  onProject: (id: string) => void;
}) {
  return (
    <div className="project-checklist">
      <p className="checklist-help">
        Expand projects and options to review their costs. Totals belong to each
        option, with currencies and energy rates kept separate.
      </p>
      {projects.map((project) => {
        const options = projectCostOptions(project);
        const totalItems = options.reduce(
          (count, option) => count + option.items.length,
          0,
        );
        return (
          <article
            className="checklist-project panel"
            key={project.id}
            data-project-id={project.id}
            aria-labelledby={`checklist-project-${project.id}`}
          >
            <header className="checklist-project-header">
              <span
                className={`project-icon color-${project.color}`}
                aria-hidden="true"
              >
                {project.name[0]}
              </span>
              <div className="checklist-project-identity">
                {project.reference && <small>{project.reference}</small>}
                <h2 id={`checklist-project-${project.id}`}>{project.name}</h2>
                <div className="checklist-project-meta">
                  {project.category && <span>{project.category}</span>}
                  {project.plannedCodYear != null && (
                    <span>Planned COD {project.plannedCodYear}</span>
                  )}
                  <span>
                    {PROJECT_STATUS_LABEL[project.status || "active"]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button secondary checklist-open-project"
                aria-label={`Open project: ${project.name}`}
                onClick={() => onProject(project.id)}
              >
                Open project <ArrowUpRight size={16} />
              </button>
            </header>
            {options.length ? (
              <details className="checklist-project-details" open>
                <summary aria-label={`Options and costs for ${project.name}`}>
                  <ChevronDown size={16} className="checklist-chevron" />
                  <span>Options and costs</span>
                  <small>
                    {options.length}{" "}
                    {options.length === 1 ? "option" : "options"}
                    {" · "}
                    {totalItems} {totalItems === 1 ? "cost" : "costs"}
                  </small>
                </summary>
                <div className="checklist-options">
                  {options.map((option) => (
                    <details className="checklist-option" key={option.id} open>
                      <summary>
                        <ChevronDown size={16} className="checklist-chevron" />
                        <span className="checklist-option-name">
                          {option.title}
                        </span>
                        <small>
                          {option.items.length}{" "}
                          {option.items.length === 1 ? "cost" : "costs"}
                        </small>
                      </summary>
                      {option.items.length ? (
                        <>
                          <ul
                            className="checklist-costs"
                            aria-label={`Costs in ${option.title}`}
                          >
                            {option.items.map((item) => (
                              <li key={item.id}>
                                <span className="checklist-cost-title">
                                  {item.title}
                                </span>
                                <span className="checklist-cost-unit">
                                  {item.unit}
                                </span>
                                <strong className="checklist-cost-amount">
                                  {formatCostAmount(item.amount, item.unit)}
                                </strong>
                              </li>
                            ))}
                          </ul>
                          <div className="checklist-option-total-row">
                            <span>Option total</span>
                            <UnitTotals totals={costUnitTotals(option.items)} />
                          </div>
                        </>
                      ) : (
                        <p className="checklist-no-costs">
                          No costs in this option yet.
                        </p>
                      )}
                    </details>
                  ))}
                </div>
              </details>
            ) : (
              <p className="checklist-no-costs">
                No options or costs added yet.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
