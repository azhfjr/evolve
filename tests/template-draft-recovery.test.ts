import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeFormDraft,
  decodeFormDraft,
  formDraftKey,
} from "../src/lib/connected/drafts";
const definition = {
  fields: [
    {
      key: "",
      label: "Unfinished",
      guidance: "",
      active: true,
      required: false,
      options: [
        { id: "11111111-1111-4111-8111-111111111111", label: "", active: true },
      ],
    },
  ],
};
test("browser template drafts preserve incomplete bounded definitions and original version", () => {
  const raw = encodeFormDraft(
    { templateDefinition: definition, __baseVersion: 7 },
    1000,
  );
  assert.deepEqual(decodeFormDraft(raw, 1001), {
    templateDefinition: definition,
    __baseVersion: 7,
  });
  assert.equal(decodeFormDraft(raw, 1000 + 7 * 86400000 + 1), null);
  assert.notEqual(
    formDraftKey("a@example.com", "project-template", "primary"),
    formDraftKey("b@example.com", "project-template", "primary"),
  );
});
test("template browser drafts reject unknown data, oversized collections and binary-like values", () => {
  for (const bad of [
    { ...definition, token: "sensitive" },
    { fields: Array(21).fill(definition.fields[0]) },
    { fields: [{ ...definition.fields[0], guidance: "x".repeat(401) }] },
    new Uint8Array(10),
  ]) {
    assert.deepEqual(
      decodeFormDraft(encodeFormDraft({ templateDefinition: bad }, 1000), 1001),
      {},
    );
  }
});
