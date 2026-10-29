import type { z } from "zod";
import { getTranslator, type Locale } from "./core";
export function validationMessage(issue: z.core.$ZodIssue, locale: Locale) {
  const t = getTranslator(locale);
  if (issue.code === "custom") return t(issue.message);
  if (issue.code === "too_big")
    return t(
      issue.origin === "array"
        ? "Use up to {count} items."
        : "Use up to {count} characters.",
      { count: Number(issue.maximum) },
    );
  if (issue.code === "too_small" && issue.origin === "string")
    return t("Enter at least {count} characters.", {
      count: Number(issue.minimum),
    });
  if (issue.code === "invalid_value") return t("Choose a valid option.");
  if (issue.code === "unrecognized_keys")
    return t("Check the provided fields and try again.");
  return t("Enter a valid value.");
}
export function validationSummary(issues: z.core.$ZodIssue[], locale: Locale) {
  const t = getTranslator(locale);
  const names: Record<string, string> = {
    title: "Task title",
    description: "Description",
    dueDate: "Due date",
    dueTime: "Due time",
    assignee: "Assignee",
    projectId: "Project",
    name: "Full name",
    email: "Google email",
    timeZone: "Time zone",
    locale: "Language",
    labels: "Labels",
    checklist: "Checklist",
    dependencies: "Planning",
  };
  return issues
    .map(
      (issue) =>
        `${t(names[String(issue.path[0])] || "Value")}: ${validationMessage(issue, locale)}`,
    )
    .join("; ");
}
