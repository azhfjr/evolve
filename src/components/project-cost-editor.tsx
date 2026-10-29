"use client";
import { useId, useImperativeHandle, useRef, type Ref } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppSelect } from "./app-select";
import { MoneyInput } from "./money-input";
import {
  COST_UNITS,
  costUnitTotals,
  formatCostAmount,
  projectOptionCostItemSchema,
  type CostUnit,
  type Currency,
  type ProjectCostOption,
  type ProjectOptionCostItem,
} from "@/lib/project-model";
import { finishMoneyInput } from "@/lib/money-input";

function draftTotals(items: ProjectOptionCostItem[]) {
  const valid = items.flatMap((item) => {
    const parsed = projectOptionCostItemSchema.safeParse({
      ...item,
      title: item.title.trim() || "Draft",
      amount: finishMoneyInput(item.amount) || "0",
    });
    return parsed.success ? [parsed.data] : [];
  });
  try {
    return {
      totals: costUnitTotals(valid),
      incomplete: valid.length !== items.length,
      overflow: false,
    };
  } catch {
    return { totals: [], incomplete: false, overflow: true };
  }
}
export type ProjectCostEditorHandle = {
  focusIssue: (path: PropertyKey[]) => void;
};
export function ProjectCostEditor({
  value,
  onChange,
  defaultCurrency,
  activeId,
  onActiveChange,
  ref,
}: {
  value: ProjectCostOption[];
  onChange: (options: ProjectCostOption[]) => void;
  defaultCurrency: Currency;
  activeId: string;
  onActiveChange: (id: string) => void;
  ref?: Ref<ProjectCostEditorHandle>;
}) {
  const root = useRef<HTMLDivElement>(null),
    id = useId();
  const active = value.find((option) => option.id === activeId) || value[0];
  const count = value.reduce((n, option) => n + option.items.length, 0);
  const subtotal = draftTotals(active?.items || []);
  useImperativeHandle(ref, () => ({
    focusIssue(path) {
      const option = value[Number(path[1]) || 0];
      if (!option) return;
      onActiveChange(option.id);
      const index = Number(path[3]) || 0;
      const field =
        path[2] === "items"
          ? path[4] === "title"
            ? "Cost title"
            : path[4] === "unit"
              ? "Unit"
              : "Amount"
          : "Option name";
      const label =
        field === "Option name" || index === 0
          ? field
          : `${field} ${index + 1}`;
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLElement>(`[aria-label="${label}"]`)
          ?.focus(),
      );
    },
  }));
  function changeOption(patch: Partial<ProjectCostOption>) {
    if (active)
      onChange(
        value.map((option) =>
          option.id === active.id ? { ...option, ...patch } : option,
        ),
      );
  }
  function changeItem(index: number, patch: Partial<ProjectOptionCostItem>) {
    if (active)
      changeOption({
        items: active.items.map((item, i) =>
          i === index ? { ...item, ...patch } : item,
        ),
      });
  }
  function focusOption(option: ProjectCostOption) {
    onActiveChange(option.id);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-option-id="${option.id}"]`)
        ?.focus(),
    );
  }
  return (
    <div className="project-cost-editor" ref={root}>
      {value.length > 0 && (
        <div
          role="tablist"
          aria-label="Cost options"
          className="cost-option-tabs"
        >
          {value.map((option, index) => (
            <button
              key={option.id}
              id={`${id}-tab-${option.id}`}
              data-option-id={option.id}
              type="button"
              role="tab"
              aria-selected={active?.id === option.id}
              aria-controls={`${id}-panel`}
              tabIndex={active?.id === option.id ? 0 : -1}
              onClick={() => {
                onActiveChange(option.id);
              }}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight")
                  next = (index + 1) % value.length;
                else if (event.key === "ArrowLeft")
                  next = (index - 1 + value.length) % value.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = value.length - 1;
                else return;
                event.preventDefault();
                focusOption(value[next]);
              }}
            >
              {option.title.trim() || "Untitled option"}
              <span aria-hidden="true">{option.items.length}</span>
            </button>
          ))}
        </div>
      )}
      {active ? (
        <section
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${active.id}`}
          className="cost-option-panel"
        >
          <div className="cost-option-actions">
            <span>
              {active.items.length} cost{" "}
              {active.items.length === 1 ? "item" : "items"}
            </span>
            <button
              type="button"
              className="button secondary small-button"
              disabled={count >= 50}
              onClick={() => {
                changeOption({
                  items: [
                    ...active.items,
                    {
                      id: crypto.randomUUID(),
                      title: "",
                      unit: active.items.at(-1)?.unit || defaultCurrency,
                      amount: "",
                    },
                  ],
                });
              }}
            >
              <Plus size={14} />
              Add cost
            </button>
          </div>
          {active.items.map((item, index) => {
            const precision =
              item.unit === "IDR" || item.unit === "USD" ? 2 : 6;
            const parsed = projectOptionCostItemSchema.safeParse({
              ...item,
              title: item.title.trim() || "Draft",
              amount: finishMoneyInput(item.amount) || "0",
            });
            const invalid = Boolean(item.amount) && !parsed.success;
            return (
              <fieldset className="cost-item-fields" key={item.id}>
                <legend>Cost {index + 1}</legend>
                <label className="cost-title-field">
                  Cost title
                  <input
                    required
                    aria-label={
                      index === 0 ? "Cost title" : `Cost title ${index + 1}`
                    }
                    maxLength={120}
                    placeholder="e.g. Equipment or energy tariff"
                    value={item.title}
                    onChange={(e) =>
                      changeItem(index, { title: e.target.value })
                    }
                  />
                </label>
                <div className="cost-item-values">
                  <label>
                    Unit
                    <AppSelect
                      aria-label={index === 0 ? "Unit" : `Unit ${index + 1}`}
                      value={item.unit}
                      onValueChange={(unit) =>
                        changeItem(index, { unit: unit as CostUnit })
                      }
                    >
                      {COST_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </AppSelect>
                  </label>
                  <label>
                    Amount
                    <MoneyInput
                      required
                      aria-label={
                        index === 0 ? "Amount" : `Amount ${index + 1}`
                      }
                      aria-invalid={invalid || undefined}
                      decimalPlaces={precision}
                      placeholder={precision === 2 ? "0.00" : "0.000000"}
                      value={item.amount}
                      onValueChange={(amount) => changeItem(index, { amount })}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button cost-remove"
                    aria-label={`Remove cost ${index + 1}`}
                    onClick={() =>
                      changeOption({
                        items: active.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {invalid && (
                  <p className="form-error">
                    Use up to {precision} decimal places for {item.unit}.
                  </p>
                )}
              </fieldset>
            );
          })}
          {!active.items.length && (
            <p className="cost-empty-note">
              No cost items in this option. Add a cost to start.
            </p>
          )}
          <div
            className="cost-editor-subtotals"
            aria-live="polite"
            aria-atomic="true"
          >
            <span>Option total</span>
            {subtotal.totals.map((t) => (
              <strong key={t.unit}>{formatCostAmount(t.amount, t.unit)}</strong>
            ))}
            {!subtotal.totals.length && <strong>—</strong>}
          </div>
        </section>
      ) : (
        <p className="cost-empty-note">
          Create a project option above to enter its costs.
        </p>
      )}
      <p className={subtotal.overflow ? "form-error" : "field-help"}>
        {subtotal.overflow
          ? "An amount is outside the supported storage range. Check this option before saving."
          : subtotal.incomplete
            ? "This option’s total excludes incomplete or invalid amounts."
            : "Totals apply only to the selected option. Currencies and energy rates stay separate."}
      </p>
    </div>
  );
}
