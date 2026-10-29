import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  parseISO,
} from "date-fns";
import { enUS, id } from "date-fns/locale";
import { messages } from "./messages";
export const LOCALES = ["en", "id"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export function validLocale(value: unknown): value is Locale {
  return value === "en" || value === "id";
}
export function localeTag(locale: Locale) {
  return locale === "id" ? "id-ID" : "en-US";
}
export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;
const dictionary: Record<string, readonly [string, string]> = messages;
const aliases = new Map<string, readonly [string, string]>();
for (const pair of Object.values(dictionary)) {
  aliases.set(pair[0], pair);
  aliases.set(pair[1], pair);
}
export function getTranslator(locale: Locale): Translator {
  return (key, values) => {
    const pair = dictionary[key] || aliases.get(key);
    const text = pair ? pair[locale === "id" ? 1 : 0] : key;
    return values
      ? text.replace(/\{(\w+)\}/g, (all, name) =>
          values[name] === undefined ? all : String(values[name]),
        )
      : text;
  };
}
export function localizedDate(
  date: Date | string | number,
  pattern: string,
  locale: Locale,
) {
  const parsed = typeof date === "string" ? parseISO(date) : date;
  const patterns: Record<string, string> = {
    "MMM d": "d MMM",
    "MMM d, yyyy": "d MMM yyyy",
    "MMMM d, yyyy": "d MMMM yyyy",
    "EEEE, MMMM d, yyyy": "EEEE, d MMMM yyyy",
    "MMM d, yyyy · h:mm a": "d MMM yyyy · HH:mm",
  };
  return format(
    parsed,
    locale === "id" ? patterns[pattern] || pattern : pattern,
    { locale: locale === "id" ? id : enUS },
  );
}
export function relativeDate(date: Date | string, locale: Locale) {
  return formatDistanceToNow(typeof date === "string" ? parseISO(date) : date, {
    addSuffix: true,
    locale: locale === "id" ? id : enUS,
  });
}
export function localizedDueDate(date: string | null, locale: Locale) {
  const t = getTranslator(locale);
  if (!date) return t("No due date");
  const parsed = parseISO(date);
  return isToday(parsed)
    ? t("Today")
    : isTomorrow(parsed)
      ? t("Tomorrow")
      : localizedDate(parsed, locale === "id" ? "d MMM" : "MMM d", locale);
}
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}
