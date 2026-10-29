import { z } from "zod";

export const cleanLabel = (label: string) =>
  label
    .normalize("NFKC")
    .trim()
    .replace(/^#+/u, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "_");
export const labelKey = cleanLabel;
export const displayLabel = (label: string) => `#${cleanLabel(label)}`;
// Case folding can expand one visible character (İ → i + combining dot).
const labelCharacters = new Intl.Segmenter("und", { granularity: "grapheme" });

// Existing records may contain a previously valid bare #. Keep storage intact,
// omit empty active tags, and never apply new-write validation while reading.
export function readProjectLabels(labels: readonly string[]) {
  return [
    ...new Set(
      labels
        .map(cleanLabel)
        .filter((label) => label && !/[\p{Cc}\p{Cf}]/u.test(label)),
    ),
  ];
}

export const labelsSchema = z
  .array(
    z
      .string()
      .regex(/^[^\p{Cc}\p{Cf}]*$/u, "Use visible characters for labels.")
      .transform(cleanLabel)
      .pipe(
        z
          .string()
          .min(1)
          .max(120)
          .refine(
            (label) => [...labelCharacters.segment(label)].length <= 30,
            "Use up to 30 characters per label.",
          )
          .regex(/^[^\p{Cc}\p{Cf}]+$/u, "Use visible characters for labels."),
      ),
  )
  .transform((labels) => [
    ...new Map(labels.map((label) => [labelKey(label), label])).values(),
  ])
  .pipe(z.array(z.string()).max(10));

export function mergeLabels(labels: string[], pending: string) {
  return labelsSchema.parse([
    ...labels,
    ...pending.split(",").filter((label) => label.trim()),
  ]);
}
