import { cleanLabel, labelsSchema } from "./labels";

/** Rename only this project's assignment; labels shared by other projects stay intact. */
export function renameProjectLabel(
  labels: readonly string[],
  original: string,
  draft: string,
) {
  const key = cleanLabel(original);
  if (!labels.some((label) => cleanLabel(label) === key))
    throw new Error(
      "This label is no longer selected. Reload the current labels.",
    );
  if (draft.includes(",")) throw new Error("Rename one label at a time.");
  const replacement = labelsSchema.parse([draft])[0];
  return labelsSchema.parse(
    labels.map((label) => (cleanLabel(label) === key ? replacement : label)),
  );
}

export function selectionAfterLabelEdit(
  selected: string,
  before: readonly string[],
  after: readonly string[],
  renames: Readonly<Record<string, string>> = {},
) {
  const current = cleanLabel(selected);
  const next = after.map(cleanLabel);
  if (next.includes(current)) return current;
  const target = cleanLabel(
    Object.hasOwn(renames, current) ? renames[current] : "",
  );
  if (target && next.includes(target)) return target;
  const index = before.findIndex((label) => cleanLabel(label) === current);
  return next[Math.max(0, index)] || next[0] || "";
}
