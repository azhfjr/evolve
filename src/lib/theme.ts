export type ThemePreference = "system" | "light" | "dark";
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  try {
    localStorage.setItem("evolve-theme", preference);
  } catch {
    /* Storage is optional. */
  }
}
// A parser-blocking head script runs before the body can paint. Only validated
// enum values are embedded; account preferences always take precedence over cache.
export function themeBootstrapScript(preference: ThemePreference | null) {
  return `(function(){var r=document.documentElement,p=${JSON.stringify(preference)};if(!p){try{p=localStorage.getItem("evolve-theme")}catch(e){}if(p!=="light"&&p!=="dark"&&p!=="system")p="system"}r.dataset.themePreference=p;var m=window.matchMedia("(prefers-color-scheme: dark)");function apply(){var p=r.dataset.themePreference,t=p==="system"?(m.matches?"dark":"light"):p;r.dataset.theme=t;r.style.colorScheme=t}apply();m.addEventListener("change",apply)})();`;
}
