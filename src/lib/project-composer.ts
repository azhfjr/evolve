import { z } from "zod";
import {
  projectFields,
  projectCostItemSchema,
  COST_UNITS,
  projectCostOptions,
} from "./project-model";
import { finishMoneyInput, MAX_MONEY_INPUT_LENGTH } from "./money-input";
// The API streams at most 2 MB. A draft can hold both visible/legacy fields
// plus the exact original receipt payload (escaped once more as JSON).
const MAX_PROJECT_REQUEST_CHARACTERS = 2000000;
const MAX_PROJECT_DRAFT_CHARACTERS = MAX_PROJECT_REQUEST_CHARACTERS * 4;

// Drafts preserve incomplete input; projectFields validates the final command.
export const projectDraftFields = projectFields.extend({
  name: z.string().max(80),
  costOptions: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().max(120),
        items: z
          .array(
            z.object({
              id: z.uuid(),
              title: z.string().max(120),
              unit: z.enum(COST_UNITS),
              amount: z.string().max(MAX_MONEY_INPUT_LENGTH),
            }),
          )
          .max(50),
      }),
    )
    .max(10)
    .refine(
      (options) =>
        options.reduce((count, option) => count + option.items.length, 0) <= 50,
      "A project supports at most 50 cost items.",
    )
    .optional(),
  budget: z.string().max(MAX_MONEY_INPUT_LENGTH),
  costItems: z
    .array(
      projectCostItemSchema.extend({
        title: z.string().max(120),
        amount: z.string().max(MAX_MONEY_INPUT_LENGTH),
      }),
    )
    .max(50)
    .optional(),
});
const savedDraftSchema = z.object({
  fields: projectDraftFields,
  request: z.object({
    id: z.uuid(),
    fingerprint: z.string().max(MAX_PROJECT_REQUEST_CHARACTERS),
  }),
});
export type ProjectDraft = z.infer<typeof savedDraftSchema>;
// New editors submit the visible groups, never stale hidden legacy cost rows.
// A restored, unchanged legacy request must keep its original receipt payload.
export function projectSubmissionFields(
  fields: ProjectDraft["fields"],
  priorFingerprint = "",
) {
  const parsed = projectFields.safeParse({
    ...fields,
    budget: finishMoneyInput(fields.budget) || "0",
    costOptions: fields.costOptions?.map((option) => ({
      ...option,
      items: option.items.map((item) => ({
        ...item,
        amount: finishMoneyInput(item.amount),
      })),
    })),
    costItems: fields.costOptions
      ? undefined
      : fields.costItems?.map((item) => ({
          ...item,
          amount: finishMoneyInput(item.amount),
        })),
  });
  if (parsed.success && priorFingerprint) {
    try {
      const original = projectFields.safeParse(JSON.parse(priorFingerprint));
      if (original.success) {
        // Older grouped requests also carried the monetary compatibility rows.
        // Compare the visible groups, but replay the exact original command.
        const hydrated = projectFields.parse({
          ...original.data,
          costOptions:
            original.data.costOptions ?? projectCostOptions(original.data),
          costItems: undefined,
        });
        const comparable = (value: typeof parsed.data) => {
          const { category, plannedCodYear, ...rest } = value;
          return JSON.stringify({
            ...rest,
            category: category ?? null,
            plannedCodYear: plannedCodYear ?? null,
          });
        };
        if (comparable(hydrated) === comparable(parsed.data)) return original;
      }
    } catch {
      // Corrupt or edited legacy payloads use a freshly validated request.
    }
  }
  return parsed;
}
export function projectDraftKey(email: string, demo: boolean) {
  return `evolve-project-draft-v1:${demo ? "demo" : "workspace"}:${email.toLowerCase()}`;
}
export function parseProjectDraft(
  raw: string | null,
  now = Date.now(),
): ProjectDraft | null {
  if (!raw || raw.length > MAX_PROJECT_DRAFT_CHARACTERS) return null;
  try {
    const saved = JSON.parse(raw);
    if (
      typeof saved.savedAt !== "number" ||
      saved.savedAt > now ||
      now - saved.savedAt > 86400000
    )
      return null;
    const parsed = savedDraftSchema.safeParse(saved.draft);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function readProjectDraft(key: string) {
  try {
    return parseProjectDraft(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}
export function writeProjectDraft(key: string, draft: ProjectDraft) {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), draft }),
    );
    return true;
  } catch {
    return false;
  }
}
export function removeProjectDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}
export function clearProjectDrafts(email: string, demo: boolean) {
  try {
    window.sessionStorage.removeItem(projectDraftKey(email, demo));
  } catch {}
}
