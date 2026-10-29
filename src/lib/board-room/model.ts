import { customValuesSchema } from "../project-template/model";
import { REGION_CODES, type RegionalAnalytics } from "./regions";
import { z } from "zod";
import type { Actor } from "../types";
import type { AttachmentInfo } from "../attachment-types";
export const BOARD_TITLE = "Kalimantan - Power System Projects";
export const PRIMARY_CATEGORIES = [
  "Pembangkit",
  "Transmisi",
  "Gardu Induk",
] as const;
export const CAPACITY_UNITS = ["MW", "MVA", "kms", "MWh", "MWp", "MWac"];
export const DEFAULT_STAGES = Array.from(
  { length: 10 },
  (_, i) => `Stage ${i + 1}`,
);
const year = z.number().int().min(1900).max(2200).nullable();
const safeLink = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Use HTTP(S) links without embedded credentials.");
export const projectSchema = z
  .object({
    templateRevision: z.number().int().nonnegative().optional(),
    customValues: customValuesSchema.optional(),
    externalId: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/,
        "RUPTL Code must use letters, digits, periods, underscores or hyphens.",
      ),
    name: z.string().trim().min(1).max(160),
    category: z.union([z.enum(PRIMARY_CATEGORIES), z.literal("")]).default(""),
    capacity: z.number().finite().nonnegative().nullable().default(null),
    unit: z.string().trim().max(30).default(""),
    startYear: year.default(null),
    codYear: year.default(null),
    description: z.string().trim().max(2000).default(""),
    location: z.string().trim().max(160).default(""),
    links: z.array(safeLink).max(20).default([]),
    linkLabels: z.array(z.string().trim().max(120)).max(20).default([]),
    responsible: z.string().trim().max(160).optional(),
    documentChecklist: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(160),
            checked: z.boolean(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    scope: z.string().trim().max(500).default(""),
    voltage: z
      .union([z.string(), z.number().finite()])
      .transform(String)
      .pipe(z.string().trim().max(120))
      .default(""),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.linkLabels.length && v.linkLabels.length !== v.links.length)
      c.addIssue({
        code: "custom",
        path: ["linkLabels"],
        message: "Link labels must match the project links.",
      });
    if (v.capacity !== null && !v.unit)
      c.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Capacity requires a unit.",
      });
    if (v.startYear !== null && v.codYear !== null && v.startYear > v.codYear)
      c.addIssue({
        code: "custom",
        path: ["startYear"],
        message: "Start year cannot exceed planned COD year.",
      });
  });
export type ProjectValues = z.infer<typeof projectSchema>;
export type ProjectPayload = ProjectValues & {
  stage: number;
  completed: boolean;
  progressReviewedAt?: string | null;
  progressReviewedBy?: string | null;
  progressReviewNote?: string;
  documentReviewNote?: string;
};
// Legacy custom assignments stay in their historical tables, outside the active contract.
export function normalizeProjectPayload(
  data: ProjectPayload & { categoryIds?: string[] },
): ProjectPayload {
  const { categoryIds: retired, ...fields } = data;
  void retired;
  return {
    ...fields,
    responsible: fields.responsible ?? "",
    documentChecklist: fields.documentChecklist ?? [],
    progressReviewedAt: fields.progressReviewedAt ?? null,
    progressReviewedBy: fields.progressReviewedBy ?? null,
    progressReviewNote: fields.progressReviewNote ?? "",
    documentReviewNote: fields.documentReviewNote ?? "",
    scope: fields.scope ?? "",
    voltage: String(fields.voltage ?? ""),
  };
}
export type BoardProject = ProjectPayload & {
  id: string;
  version: number;
  documentRevision: number;
  reviewedRevision: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  fileCount: number;
  valid: boolean;
  updatedAt: string;
};
export type BoardConfig = {
  stages: string[];
  version: number;
  revision: number;
};
export type BoardSummary = {
  total: number;
  allTotal: number;
  valid: number;
  noFiles: number;
  needsReview: number;
  stages: number[];
  categories: { name: string; total: number; valid: number }[];
  rangeStart: number | null;
  rangeEnd: number | null;
  years: {
    year: number | null;
    total: number;
    categories: Record<string, number>;
  }[];
};
export type DashboardAnalytics = {
  regions: RegionalAnalytics;
  linkedAssets: number;
  evidence: { category: string; valid: number; review: number; none: number }[];
  assetCategories: { category: string; count: number }[];
  coverage: {
    linked: number;
    unlinked: number;
    unassignedPortfolioAssets: number;
  };
  locations: { location: string | null; count: number }[];
  capacity: {
    source: "project" | "asset";
    year: number | null;
    unit: string;
    total: string;
    measuredCount: number;
  }[];
  missingCapacity: { projects: number; assets: number };
};
export type BoardSnapshot = {
  analytics: DashboardAnalytics;
  revision?: number;
  actor: Actor;
  theme: "system" | "light" | "dark";
  profile: import("../preferences").AccountProfile;
  settings: import("../preferences").WorkspaceSettings;
  config: BoardConfig;
  projects: BoardProject[];
  summary: BoardSummary;
  page: number;
  pageSize: number;
};
export type BoardDetail = {
  project: BoardProject;
  attachments: AttachmentInfo[];
  history: {
    id: string;
    actor: string;
    kind: string;
    createdAt: string;
    detail: unknown;
  }[];
};
export const querySchema = z.object({
  customField: z
    .string()
    .regex(/^(?:|[a-z][a-z0-9_]{0,47})$/)
    .optional(),
  customOption: z.union([z.uuid(), z.literal("")]).optional(),
  region: z.enum(["", ...REGION_CODES, "missing", "unrecognized"]).default(""),
  location: z.string().max(160).default(""),
  missingLocation: z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : v),
    z.boolean().default(false),
  ),
  unit: z.string().max(30).default(""),
  assetCoverage: z.enum(["", "linked", "unlinked"]).default(""),
  search: z.string().max(160).default(""),
  category: z
    .union([
      z.enum(PRIMARY_CATEGORIES),
      z.literal(""),
      z.literal("uncategorized"),
    ])
    .default(""),
  stage: z
    .string()
    .regex(/^(?:|[0-9]|10)$/)
    .default(""),
  year: z
    .string()
    .regex(/^(?:|unknown|19\d{2}|20\d{2}|21\d{2}|2200)$/)
    .default(""),
  validation: z.enum(["", "valid", "review", "none"]).default(""),
  attention: z.enum(["", "incomplete", "stale", "unassigned"]).default(""),
  sort: z.enum(["cod", "name", "capacity"]).default("cod"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
// Keep the object schema composable for saved views; validate conflicting filters at reads.
export type BoardQuery = z.infer<typeof querySchema>;
export const EMPTY_QUERY: BoardQuery = {
  region: "",
  location: "",
  missingLocation: false,
  unit: "",
  assetCoverage: "",
  search: "",
  category: "",
  stage: "",
  year: "",
  validation: "",
  attention: "",
  sort: "cod",
  direction: "asc",
  page: 1,
};
export function documentStatus(p: Pick<BoardProject, "fileCount" | "valid">) {
  return p.valid ? "Valid" : p.fileCount ? "Needs review" : "No files";
}

export function parseLinkText(value: string) {
  const entries = value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const split = line.indexOf("|");
      return split < 0
        ? { url: line, label: "" }
        : {
            label: line.slice(0, split).trim(),
            url: line.slice(split + 1).trim(),
          };
    });
  return {
    links: entries.map((e) => e.url),
    linkLabels: entries.map((e) => e.label),
  };
}

export const KALIMANTAN_PROVINCES = [
  "Kalimantan Barat",
  "Kalimantan Tengah",
  "Kalimantan Selatan",
  "Kalimantan Timur",
  "Kalimantan Utara",
] as const;
