"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Languages } from "lucide-react";
import {
  DEFAULT_LOCALE,
  formatNumber,
  getTranslator,
  localeTag,
  localizedDate,
  localizedDueDate,
  relativeDate,
  validLocale,
  type Locale,
} from "@/lib/i18n/core";
function i18nValue(locale: Locale, setLocale: (locale: Locale) => void) {
  return {
    locale,
    setLocale,
    t: getTranslator(locale),
    formatDate: (date: Date | string | number, pattern: string) =>
      localizedDate(date, pattern, locale),
    relativeTime: (date: Date | string) => relativeDate(date, locale),
    dueDateLabel: (date: string | null) => localizedDueDate(date, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, locale, options),
    localeTag: localeTag(locale),
  };
}
const Context = createContext<ReturnType<typeof i18nValue> | null>(null);
export function I18nProvider({
  children,
  initialLocale = "en",
  onChange,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
  onChange?: (locale: Locale) => void;
}) {
  void initialLocale;
  const [locale, setValue] = useState<Locale>("en");
  const setLocale = useCallback((value: Locale) => {
    if (value === "en") setValue("en");
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = "Evolve — Every Task Matters";
    document.cookie = `evolve-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    onChange?.(locale);
  }, [locale, onChange]);
  const value = useMemo(
    () => i18nValue(locale, setLocale),
    [locale, setLocale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const context = useContext(Context);
  if (!context) throw new Error("I18nProvider is required");
  return context;
}
export function currentTranslator() {
  const cookie =
    typeof document === "undefined"
      ? ""
      : document.cookie.match(/(?:^|;\s*)evolve-locale=(en|id)(?:;|$)/)?.[1];
  return getTranslator(validLocale(cookie) ? cookie : DEFAULT_LOCALE);
}
export function LanguageSwitcher({
  onChange,
  disabled = false,
}: {
  onChange?: (locale: Locale) => void;
  disabled?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-switcher">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={locale}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          if (validLocale(value)) {
            if (onChange) onChange(value);
            else setLocale(value);
          }
        }}
      >
        <option value="en">English</option>
        <option value="id">Bahasa Indonesia</option>
      </select>
    </label>
  );
}
