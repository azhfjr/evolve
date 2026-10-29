import { test } from "node:test";
import assert from "node:assert/strict";
import {
  templateDefinitionSchema,
  validateCustomValues,
} from "../src/lib/project-template/model";
const option = crypto.randomUUID();
const def = {
  fields: [
    {
      key: "delivery_class",
      label: "Delivery class",
      guidance: "Choose the delivery class.",
      required: true,
      active: true,
      options: [{ id: option, label: "Priority", active: true }],
    },
  ],
};
test("template rejects system collisions, duplicate identities and blank options", () => {
  assert.equal(templateDefinitionSchema.safeParse(def).success, true);
  for (const fields of [
    [{ ...def.fields[0], key: "category" }],
    [def.fields[0], def.fields[0]],
    [
      {
        ...def.fields[0],
        options: [...def.fields[0].options, ...def.fields[0].options],
      },
    ],
    [{ ...def.fields[0], options: [{ id: option, label: " ", active: true }] }],
  ])
    assert.equal(templateDefinitionSchema.safeParse({ fields }).success, false);
});
test("custom requirements apply on creation/relevant edits while unchanged inactive and legacy unset values survive", () => {
  assert.throws(
    () => validateCustomValues(def, {}, undefined, true),
    /Delivery class/,
  );
  assert.deepEqual(validateCustomValues(def, {}, {}), {});
  assert.deepEqual(validateCustomValues(def, { delivery_class: option }, {}), {
    delivery_class: option,
  });
  const inactive = {
    fields: [
      {
        ...def.fields[0],
        options: [{ id: option, label: "Priority", active: false }],
      },
    ],
  };
  assert.deepEqual(
    validateCustomValues(
      inactive,
      { delivery_class: option },
      { delivery_class: option },
    ),
    { delivery_class: option },
  );
  assert.throws(
    () => validateCustomValues(inactive, { delivery_class: option }, {}, true),
    /inactive|available/i,
  );
  assert.throws(
    () =>
      validateCustomValues(
        def,
        { delivery_class: crypto.randomUUID() },
        {},
        true,
      ),
    /available/i,
  );
  assert.throws(
    () => validateCustomValues(def, { category: option }, {}, true),
    /Unknown/i,
  );
});
test("browser draft recovery retains only validated custom selections and their pinned template revision", async () => {
  const { encodeFormDraft, decodeFormDraft } =
    await import("../src/lib/connected/drafts");
  const id = crypto.randomUUID();
  const recovered = decodeFormDraft(
    encodeFormDraft({
      templateRevision: 2,
      customValues: { funding_source: id },
      files: { body: "private binary" },
      token: "secret",
    }),
  );
  assert.deepEqual(recovered?.customValues, { funding_source: id });
  assert.equal(recovered?.templateRevision, 2);
  assert.equal(recovered?.files, undefined);
  assert.equal(recovered?.token, undefined);
});
