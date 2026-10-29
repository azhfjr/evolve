import { z } from "zod";
import { querySchema } from "./model";
export const boardViewFiltersSchema = z
  .object({
    query: querySchema
      .omit({ page: true })
      .default(() => querySchema.omit({ page: true }).parse({})),
    section: z
      .enum(["overview", "projects", "documents", "reports", "map"])
      .default("overview"),
    view: z.enum(["timeline", "table"]).default("timeline"),
  })
  .strict();
export type BoardViewFilters = z.infer<typeof boardViewFiltersSchema>;
export type BoardSavedView = {
  id: string;
  name: string;
  version: number;
  filters: BoardViewFilters;
};
export const boardViewCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    filters: boardViewFiltersSchema,
  })
  .strict();
export const boardViewUpdateSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(40).optional(),
    filters: boardViewFiltersSchema.optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.filters !== undefined,
    "Provide a view name or current filters.",
  );
export const boardViewDeleteSchema = z
  .object({ id: z.uuid(), version: z.number().int().positive() })
  .strict();
