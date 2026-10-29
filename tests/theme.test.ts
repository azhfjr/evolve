import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { themeBootstrapScript } from "../src/lib/theme";
function bootstrap(
  preference: "light" | "dark" | "system" | null,
  cached: string | null,
  systemDark = false,
  denied = false,
) {
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  let listener: (() => void) | undefined;
  const media = {
    matches: systemDark,
    addEventListener: (_: string, fn: () => void) => {
      listener = fn;
    },
  };
  vm.runInNewContext(themeBootstrapScript(preference), {
    document: { documentElement: root },
    window: { matchMedia: () => media },
    localStorage: {
      getItem: () => {
        if (denied) throw new Error("denied");
        return cached;
      },
    },
  });
  return { root, media, change: () => listener?.() };
}
test("account theme overrides stale browser cache before hydration", () => {
  assert.equal(bootstrap("light", "dark", true).root.dataset.theme, "light");
  assert.equal(bootstrap("dark", "light").root.dataset.theme, "dark");
  assert.equal(bootstrap("system", "dark").root.dataset.theme, "light");
});
test("anonymous theme accepts valid cache and tolerates blocked storage", () => {
  assert.equal(bootstrap(null, "dark").root.dataset.theme, "dark");
  assert.equal(bootstrap(null, "invalid", true).root.dataset.theme, "dark");
  assert.equal(bootstrap(null, null, true, true).root.dataset.theme, "dark");
});
test("system theme follows OS changes but explicit choice stays fixed", () => {
  const runtime = bootstrap("system", null);
  runtime.media.matches = true;
  runtime.change();
  assert.equal(runtime.root.dataset.theme, "dark");
  runtime.root.dataset.themePreference = "light";
  runtime.change();
  assert.equal(runtime.root.dataset.theme, "light");
  assert.equal(runtime.root.style.colorScheme, "light");
});
