import { AppError } from "./permissions";
import {
  projectCostOptions,
  projectCostOptionsSchema,
  projectCostItemsSchema,
} from "./project-model";
import { stableJSON } from "./assets/model";
const normalizedAmount = (value: unknown) => {
  const raw = String(value ?? 0).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return raw;
  const [whole, fraction = ""] = raw.split(".");
  return (
    (whole.replace(/^0+(?=\d)/, "") || "0") +
    (fraction.replace(/0+$/, "") ? "." + fraction.replace(/0+$/, "") : "")
  );
};
export function assertLockerCostReadOnly(
  before: Parameters<typeof projectCostOptions>[0] | null,
  input: Record<string, unknown>,
) {
  const changed = () => {
    throw new AppError(
      "Project costs are managed in Board Room. Locker Room financial input has been retired.",
      410,
    );
  };
  if (!before) {
    if (
      normalizedAmount(input.budget) !== "0" ||
      (Array.isArray(input.costItems) && input.costItems.length) ||
      (Array.isArray(input.costOptions) &&
        input.costOptions.some(
          (o) => (o as { items?: unknown[] }).items?.length,
        ))
    )
      changed();
    return;
  }
  if (
    input.costOptions != null &&
    stableJSON(projectCostOptionsSchema.parse(input.costOptions)) !==
      stableJSON(projectCostOptionsSchema.parse(projectCostOptions(before)))
  )
    changed();
  if (
    input.costItems != null &&
    stableJSON(projectCostItemsSchema.parse(input.costItems)) !==
      stableJSON(projectCostItemsSchema.parse(before.costItems ?? []))
  )
    changed();
  if (
    input.budget !== undefined &&
    normalizedAmount(input.budget) !== normalizedAmount(before.budget)
  )
    changed();
  if (input.currency !== undefined && input.currency !== before.currency)
    changed();
}
