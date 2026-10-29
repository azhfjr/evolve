import { z } from "zod";
import { labelsSchema } from "./labels";
import {
  groupMoneyWhole,
  MAX_MONEY_WHOLE_DIGITS,
  MAX_MONEY_INPUT_LENGTH,
} from "./money-input";
function amountFitsStorage(amount: string) {
  return amount.split(".")[0].length <= MAX_MONEY_WHOLE_DIGITS;
}
export const CURRENCIES = ["IDR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PROJECT_STATUSES = [
  "planned",
  "active",
  "on_hold",
  "completed",
] as const;
export const PROJECT_STATUS_LABEL = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};
export function normalizeMoney(input: string): string {
  if (
    input.trim().length > MAX_MONEY_INPUT_LENGTH ||
    !/^\d+(\.\d{1,2})?$/.test(input.trim()) ||
    !amountFitsStorage(input.trim())
  )
    throw new Error(
      "Enter an amount within the supported storage capacity, with at most two decimal places.",
    );
  const [whole, fraction = ""] = input.trim().split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}
export const amountSchema = z
  .string()
  .trim()
  .max(MAX_MONEY_INPUT_LENGTH)
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Enter an amount without grouping separators, with at most two decimal places.",
  )
  .refine(amountFitsStorage, "Amount exceeds the supported storage capacity.")
  .transform(normalizeMoney);
export function moneyMinor(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid stored monetary amount.");
  const [whole, part = ""] = value.split(".");
  const fraction = part.padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(fraction);
}
export function moneyFromMinor(value: bigint) {
  const negative = value < 0n;
  const n = negative ? -value : value;
  return `${negative ? "-" : ""}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
export function sumMoney(values: string[]) {
  return moneyFromMinor(
    values.reduce((sum, value) => sum + moneyMinor(value), 0n),
  );
}
export function formatMoney(value: string, currency: Currency) {
  const text = value;
  const negative = text.startsWith("-");
  const magnitude = negative ? text.slice(1) : text;
  const normalized = moneyFromMinor(moneyMinor(magnitude));
  const [whole, fraction] = normalized.split(".");
  const number = `${groupMoneyWhole(whole)}${currency === "USD" || fraction !== "00" ? `.${fraction}` : ""}`;
  return `${negative ? "-" : ""}${currency === "USD" ? "$" : "IDR "}${number}`;
}
export const projectCostItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(120),
    currency: z.enum(CURRENCIES),
    amount: amountSchema,
  })
  .strict();
export type ProjectCostItem = z.infer<typeof projectCostItemSchema>;
export function costTotals(
  items: Pick<ProjectCostItem, "currency" | "amount">[],
) {
  return CURRENCIES.flatMap((currency) => {
    const values = items
      .filter((item) => item.currency === currency)
      .map((item) => item.amount);
    return values.length ? [{ currency, amount: sumMoney(values) }] : [];
  });
}
export const projectCostItemsSchema = z
  .array(projectCostItemSchema)
  .max(50)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Cost items must have unique IDs.",
  )
  .refine((items) => {
    try {
      return costTotals(items).every((total) =>
        amountFitsStorage(total.amount),
      );
    } catch {
      return false;
    }
  }, "Legacy budget total exceeds the supported storage capacity.");
export function projectCosts(project: {
  id?: string;
  costItems?: ProjectCostItem[] | null;
  currency?: Currency;
  budget?: string;
}): ProjectCostItem[] {
  return (
    project.costItems ?? [
      {
        id: project.id || "00000000-0000-4000-8000-000000000001",
        title: "Project cost",
        currency: project.currency || "IDR",
        amount: project.budget || "0.00",
      },
    ]
  );
}
export const PROJECT_CATEGORIES = [
  "Pembangkit",
  "Transmisi",
  "Gardu Induk",
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const PLANNED_COD_YEARS = Array.from({ length: 15 }, (_, i) => 2026 + i);
export const COST_UNITS = ["IDR", "USD", "cUSD/kWh", "Rp/kWh"] as const;
export type CostUnit = (typeof COST_UNITS)[number];
function costScale(unit: CostUnit) {
  return unit === "IDR" || unit === "USD" ? 2 : 6;
}
function costMinor(amount: string, unit: CostUnit): bigint {
  const scale = costScale(unit);
  if (!new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(amount))
    throw new Error("Invalid cost amount or precision.");
  const [whole, fraction = ""] = amount.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"))
  );
}
function costFromMinor(amount: bigint, unit: CostUnit): string {
  const scale = costScale(unit),
    factor = 10n ** BigInt(scale);
  const fraction = String(amount % factor).padStart(scale, "0");
  if (scale === 2) return `${amount / factor}.${fraction}`;
  const trimmed = fraction.replace(/0+$/, "");
  return `${amount / factor}${trimmed ? `.${trimmed}` : ""}`;
}
export const projectOptionCostItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(120),
    unit: z.enum(COST_UNITS),
    amount: z.string().trim().max(MAX_MONEY_INPUT_LENGTH),
  })
  .strict()
  .superRefine((item, context) => {
    try {
      if (!amountFitsStorage(item.amount))
        throw new Error("Amount exceeds the supported storage capacity.");
      costMinor(item.amount, item.unit);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message:
          "Enter a nonnegative amount within the supported storage capacity, with at most two monetary or six rate decimal places.",
      });
    }
  })
  .transform((item) => ({
    ...item,
    amount: costFromMinor(costMinor(item.amount, item.unit), item.unit),
  }));
export type ProjectOptionCostItem = z.infer<typeof projectOptionCostItemSchema>;
export const projectCostOptionSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(120),
    items: z.array(projectOptionCostItemSchema).max(50),
  })
  .strict();
export type ProjectCostOption = z.infer<typeof projectCostOptionSchema>;
export function costUnitTotals(
  items: Pick<ProjectOptionCostItem, "unit" | "amount">[],
): { unit: CostUnit; amount: string }[] {
  return COST_UNITS.flatMap((unit) => {
    const selected = items.filter((item) => item.unit === unit);
    if (!selected.length) return [];
    const total = selected.reduce(
      (sum, item) => sum + costMinor(item.amount, unit),
      0n,
    );
    return [{ unit, amount: costFromMinor(total, unit) }];
  });
}
export const projectCostOptionsSchema = z
  .array(projectCostOptionSchema)
  .max(10)
  .superRefine((options, context) => {
    const items = options.flatMap((option) => option.items);
    const ids = [
      ...options.map((option) => option.id.toLowerCase()),
      ...items.map((item) => item.id.toLowerCase()),
    ];
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Cost groups and items must have unique IDs.",
      });
    if (
      new Set(options.map((option) => option.title.toLowerCase())).size !==
      options.length
    )
      context.addIssue({
        code: "custom",
        message: "Cost group titles must be unique.",
      });
    if (items.length > 50)
      context.addIssue({
        code: "custom",
        message: "A project supports at most 50 cost items.",
      });
  });
export function projectCostOptions(
  project: Parameters<typeof projectCosts>[0] & {
    costOptions?: ProjectCostOption[] | null;
  },
): ProjectCostOption[] {
  if (project.costOptions != null) return project.costOptions;
  const items = projectCosts(project).map(({ currency, ...item }) => ({
    ...item,
    unit: currency,
  }));
  // Reserved stable ID is kept separate from the legacy item IDs.
  let groupIndex = 0;
  let groupId = "00000000-0000-4000-8000-000000000000";
  while (items.some((item) => item.id.toLowerCase() === groupId)) {
    groupIndex += 1;
    groupId = `00000000-0000-4000-8000-${String(groupIndex).padStart(12, "0")}`;
  }
  return [{ id: groupId, title: "General costs", items }];
}
export function formatCostAmount(amount: string, unit: CostUnit) {
  const normalized = costFromMinor(costMinor(amount, unit), unit);
  const [whole, fraction] = normalized.split(".");
  const grouped = groupMoneyWhole(whole);
  const number = `${grouped}${fraction && (unit !== "IDR" || fraction !== "00") ? `.${fraction}` : ""}`;
  return unit === "USD"
    ? `$${number}`
    : unit === "IDR"
      ? `IDR ${number}`
      : `${number} ${unit}`;
}
// Alternative options have no shared budget or flattened compatibility costs.
export function projectCostFields<
  T extends {
    currency: Currency;
    budget: string;
    costItems?: ProjectCostItem[];
    costOptions?: ProjectCostOption[];
  },
>(fields: T): T {
  if (fields.costOptions !== undefined)
    return { ...fields, costItems: [], budget: "0.00" };
  const costItems = fields.costItems;
  if (costItems === undefined) return fields;
  return {
    ...fields,
    costItems,
    budget: sumMoney(
      costItems
        .filter((item) => item.currency === fields.currency)
        .map((item) => item.amount),
    ),
  };
}
// Shared server/demo guard: old clients may keep the projection but cannot erase grouping.
export function legacyProjectCostEditConflict(
  before: {
    costOptions?: ProjectCostOption[] | null;
    costItems?: ProjectCostItem[] | null;
    budget?: string;
    currency?: Currency;
  },
  fields: {
    costOptions?: ProjectCostOption[];
    costItems?: ProjectCostItem[];
    budget: string;
    currency: Currency;
  },
) {
  if (fields.costOptions !== undefined) return false;
  if (before.costOptions != null && fields.costItems !== undefined) {
    const key = (items: ProjectCostItem[]) =>
      JSON.stringify(
        items.map((item) => [item.id, item.title, item.currency, item.amount]),
      );
    if (key(fields.costItems) !== key(before.costItems ?? [])) return true;
  }
  return (
    before.costItems != null &&
    fields.costItems === undefined &&
    (fields.budget !== before.budget || fields.currency !== before.currency)
  );
}
export const projectFields = z.object({
  category: z.enum(PROJECT_CATEGORIES).nullable().optional(),
  plannedCodYear: z.number().int().min(2026).max(2040).nullable().optional(),
  costOptions: projectCostOptionsSchema
    .nullish()
    .transform((options) => options ?? undefined),
  costItems: projectCostItemsSchema
    .nullish()
    .transform((items) => items ?? undefined),
  labels: labelsSchema.default([]),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(""),
  color: z.enum(["violet", "blue", "green", "orange", "pink"]).default("green"),
  ownerEmail: z.email().toLowerCase().nullable().default(null),
  status: z.enum(PROJECT_STATUSES).default("planned"),
  startDate: z.iso.date().nullable().default(null),
  targetDate: z.iso.date().nullable().default(null),
  currency: z.enum(CURRENCIES).default("IDR"),
  budget: amountSchema.default("0.00"),
  reference: z.string().trim().max(60).default(""),
  location: z.string().trim().max(160).default(""),
});
export const expenseFields = z.object({
  projectId: z.uuid(),
  currency: z.enum(CURRENCIES),
  amount: amountSchema.refine(
    (value) => moneyMinor(value) > 0n,
    "Enter an amount greater than zero.",
  ),
  description: z.string().trim().min(1).max(250),
  category: z.enum([
    "engineering",
    "procurement",
    "construction",
    "operations",
    "other",
  ]),
  bookedOn: z.iso.date(),
  payee: z.string().trim().max(120).default(""),
});
export type ProjectExpense = {
  id: string;
  projectId: string;
  currency: Currency;
  amount: string;
  description: string;
  category: string;
  bookedOn: string;
  payee: string;
  createdBy: string;
  createdAt: string;
  voided: boolean;
  version: number;
};
export const savedFilterSchema = z
  .object({
    scope: z.enum(["tasks", "mytasks", "archive", "project"]).default("tasks"),
    projectId: z.uuid().optional(),
    q: z.string().trim().max(200).default(""),
    open: z.boolean().default(false),
    status: z
      .enum(["", "backlog", "todo", "in_progress", "review", "done"])
      .default(""),
    priority: z
      .enum(["", "none", "low", "medium", "high", "urgent"])
      .default(""),
    assignee: z
      .union([z.email(), z.literal("unassigned"), z.literal("")])
      .default(""),
    dueBucket: z
      .enum(["", "overdue", "today", "future", "upcoming", "unscheduled"])
      .default(""),
    sort: z.enum(["updated", "due", "priority", "title"]).default("updated"),
    view: z.enum(["list", "board", "calendar"]).default("list"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    dateMode: z.enum(["due", "overlap"]).optional(),
  })
  .strict();
export type SavedView = {
  id: string;
  name: string;
  filters: z.infer<typeof savedFilterSchema>;
};
