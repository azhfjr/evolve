import { test } from "node:test";
import assert from "node:assert/strict";
import { experienceAttributes } from "../src/components/workspace-appearance";
import { DEFAULT_PREFERENCES, DEFAULT_WORKSPACE } from "../src/lib/preferences";
test("shared appearance applies saved large-font and content-width settings", () => {
  const a = experienceAttributes(DEFAULT_PREFERENCES, {
    ...DEFAULT_WORKSPACE,
    configuration: {
      ...DEFAULT_WORKSPACE.configuration,
      fontScale: "large",
      contentWidth: "comfortable",
    },
  });
  assert.equal(a["data-font-scale"], "large");
  assert.equal(a["data-content-width"], "comfortable");
});
