import { z } from "zod";
import { AppError } from "../permissions";
const stableJSON = (values: Record<string, unknown>) =>
  JSON.stringify(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key]]),
  );
const reserved = new Set([
  "id",
  "externalid",
  "name",
  "category",
  "primarycategory",
  "capacity",
  "unit",
  "capacityunit",
  "startyear",
  "codyear",
  "plannedcodyear",
  "description",
  "location",
  "links",
  "linklabels",
  "scope",
  "voltage",
  "stage",
  "completed",
  "responsible",
  "documentdate",
  "documents",
  "documentchecklist",
  "customvalues",
  "templaterevision",
  "costs",
  "costoptions",
  "budget",
  "currency",
]);
export const templateDefinitionSchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            key: z
              .string()
              .regex(/^[a-z][a-z0-9_]{0,47}$/)
              .refine(
                (k) => !reserved.has(k.replaceAll("_", "")),
                "System field keys cannot be reused.",
              ),
            label: z.string().trim().min(1).max(120),
            guidance: z.string().trim().max(400).default(""),
            required: z.boolean().default(false),
            active: z.boolean().default(true),
            options: z
              .array(
                z
                  .object({
                    id: z.uuid(),
                    label: z.string().trim().min(1).max(120),
                    active: z.boolean().default(true),
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((def, ctx) => {
    const keys = new Set<string>(),
      labels = new Set<string>(),
      ids = new Set<string>();
    def.fields.forEach((f, i) => {
      if (keys.has(f.key) || labels.has(f.label.toLowerCase()))
        ctx.addIssue({
          code: "custom",
          path: ["fields", i],
          message: "Field keys and labels must be unique.",
        });
      keys.add(f.key);
      labels.add(f.label.toLowerCase());
      const options = new Set<string>();
      f.options.forEach((o, j) => {
        if (ids.has(o.id) || options.has(o.label.toLowerCase()))
          ctx.addIssue({
            code: "custom",
            path: ["fields", i, "options", j],
            message: "Option identities and labels must be unique.",
          });
        ids.add(o.id);
        options.add(o.label.toLowerCase());
      });
      if (f.active && !f.options.some((o) => o.active))
        ctx.addIssue({
          code: "custom",
          path: ["fields", i],
          message: "An active field needs an active option.",
        });
    });
  });
// Browser recovery accepts incomplete editor input, never arbitrary object data.
const draftField = templateDefinitionSchema.shape.fields.element;
export const templateDraftDefinitionSchema = z
  .object({
    fields: z
      .array(
        draftField.extend({
          key: z.string().max(48),
          label: z.string().max(120),
          options: z
            .array(
              draftField.shape.options.element.extend({
                label: z.string().max(120),
              }),
            )
            .max(50),
        }),
      )
      .max(20),
  })
  .strict();
export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;
export const customValuesSchema = z
  .record(z.string().min(1).max(48), z.uuid().nullable())
  .refine(
    (values) => Object.keys(values).length <= 20,
    "At most twenty custom fields are supported.",
  );
export type CustomValues = z.infer<typeof customValuesSchema>;
export function validateCustomValues(
  def: TemplateDefinition,
  incoming: CustomValues,
  previous: CustomValues = {},
  creating = false,
): CustomValues {
  const next = { ...previous, ...customValuesSchema.parse(incoming) };
  const changed = creating || stableJSON(previous) !== stableJSON(next);
  for (const [key, value] of Object.entries(next)) {
    const field = def.fields.find((f) => f.key === key);
    if (!field) {
      if (!creating && previous[key] === value) continue;
      throw new AppError(`Unknown custom field: ${key}.`);
    }
    if (!creating && previous[key] === value) continue;
    if (value === null) continue;
    if (!field.active || !field.options.some((o) => o.id === value && o.active))
      throw new AppError(
        `${field.label}: choose an available option; inactive values can only be retained unchanged.`,
      );
  }
  if (changed)
    for (const f of def.fields)
      if (f.active && f.required && !next[f.key])
        throw new AppError(
          `${f.label} is required when creating a project or changing custom metadata.`,
        );
  return next;
}
export function assertPublishedIdentities(
  previous: TemplateDefinition,
  next: TemplateDefinition,
) {
  for (const field of previous.fields) {
    const found = next.fields.find((f) => f.key === field.key);
    if (!found)
      throw new AppError(
        "Deactivate published fields instead of deleting or changing their keys.",
      );
    for (const option of field.options)
      if (!found.options.some((o) => o.id === option.id))
        throw new AppError(
          "Deactivate published options instead of deleting their identities.",
        );
  }
}
