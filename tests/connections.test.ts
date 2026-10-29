import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../src/lib/demo";
import { labelKey, labelsSchema, mergeLabels } from "../src/lib/labels";
import {
  connectionQuerySchema,
  demoConnections,
  connectionCatalogSchema,
  connectionItemsSchema,
  connectionEntitySchema,
} from "../src/lib/connection-model";
import {
  moneyInputDisplay,
  moneyInputValue,
  finishMoneyInput,
  moneyCaret,
} from "../src/lib/money-input";
import { normalizeMoney } from "../src/lib/project-model";

test("shared labels normalize Unicode and whitespace while matching case-insensitively", () => {
  assert.equal(labelKey("  Ｄｅｓｉｇｎ  system  "), "design_system");
  assert.deepEqual(labelsSchema.parse([" Design ", "design", "Operations"]), [
    "design",
    "operations",
  ]);
  assert.deepEqual(mergeLabels(["Design"], "Design, Launch"), [
    "design",
    "launch",
  ]);
  assert.throws(() => labelsSchema.parse(["x".repeat(31)]));
});
test("the demo map links project-to-project and project-to-task by label, excluding archived tasks", () => {
  const data = createDemo();
  data.projects[0].labels = [" shared "];
  data.projects[1].labels = ["SHARED"];
  data.tasks = data.tasks.slice(0, 2);
  data.tasks[0].projectId = data.projects[0].id;
  data.tasks[1].projectId = data.projects[1].id;
  data.tasks[0].labels = ["Retired label"];
  data.tasks[1].labels = ["shared"];
  data.tasks[1].archived = true;
  const catalog = connectionCatalogSchema.parse(
    demoConnections(data, connectionQuerySchema.parse({ q: "shared" })),
  );
  assert.equal(catalog.groups[0].projectCount, 2);
  assert.equal(catalog.groups[0].taskCount, 1);
  const items = connectionItemsSchema.parse(
    demoConnections(
      data,
      connectionQuerySchema.parse({ mode: "items", label: " SHARED " }),
    ),
  );
  assert.equal(items.total, 3);
  const archived = connectionItemsSchema.parse(
    demoConnections(
      data,
      connectionQuerySchema.parse({
        mode: "items",
        label: "shared",
        includeArchived: "true",
      }),
    ),
  );
  assert.equal(archived.total, 4);
  assert.equal(archived.items.filter((item) => item.archived).length, 1);
  assert.equal(items.items.filter((i) => i.kind === "project").length, 2);
});
test("connection cursors keep filters bound and traverse every item without duplicates", () => {
  const data = createDemo();
  for (const t of data.tasks) t.labels = ["Shared"];
  for (const p of data.projects) p.labels = ["Shared"];
  let cursor: string | undefined;
  const ids: string[] = [];
  do {
    const query = connectionQuerySchema.parse({
      mode: "items",
      label: "shared",
      limit: 3,
      cursor,
    });
    const page = connectionItemsSchema.parse(demoConnections(data, query));
    ids.push(...page.items.map((i) => i.kind + ":" + i.id));
    cursor = page.nextCursor || undefined;
  } while (cursor);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    ids.length,
    data.projects.length + data.tasks.filter((t) => !t.archived).length,
  );
  const first = connectionItemsSchema.parse(
    demoConnections(
      data,
      connectionQuerySchema.parse({ mode: "items", label: "shared", limit: 3 }),
    ),
  );
  assert.throws(() =>
    demoConnections(
      data,
      connectionQuerySchema.parse({
        mode: "items",
        label: "another",
        limit: 3,
        cursor: first.nextCursor,
      }),
    ),
  );
});
test("connection hierarchy defaults remain compatible with older item payloads", () => {
  const entity = connectionEntitySchema.parse({
    id: "legacy",
    kind: "task",
    title: "Legacy payload",
    status: "todo",
    labels: [],
  });
  assert.equal(entity.projectId, null);
  assert.deepEqual(
    connectionItemsSchema.parse({ items: [entity], total: 1, nextCursor: null })
      .parents,
    [],
  );
});
test("demo Connection hierarchy supplies only missing page parents across search, task filters and pagination", () => {
  const data = createDemo();
  data.projects = data.projects.slice(0, 2);
  data.projects.forEach((project) => (project.labels = [" ＃ＳＨＡＲＥＤ "]));
  data.tasks = data.tasks.slice(0, 3);
  data.tasks.forEach((task, index) => {
    task.projectId = data.projects[index === 2 ? 1 : 0].id;
    task.title = `Hierarchy child ${index}`;
    task.labels = ["retired_task_label"];
    task.archived = index === 2;
  });
  const read = (filters: Record<string, unknown>) =>
    connectionItemsSchema.parse(
      demoConnections(
        data,
        connectionQuerySchema.parse({
          mode: "items",
          label: "shared",
          ...filters,
        }),
      ),
    );
  for (const filters of [{ type: "task" }, { q: "Hierarchy child" }]) {
    const page = read(filters);
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 2);
    assert.equal(page.nextCursor, null);
    assert.deepEqual(
      page.parents.map((parent) => parent.id),
      [data.projects[0].id],
    );
    assert.ok(
      page.items.every((item) => item.projectId === data.projects[0].id),
    );
    assert.deepEqual(page.parents[0].labels, ["shared"]);
    assert.equal(page.parents[0].projectId, null);
    assert.equal(page.parents[0].kind, "project");
  }
  assert.equal(
    read({ type: "task", includeArchived: "true" }).parents.length,
    2,
  );
  assert.deepEqual(read({ type: "project" }).parents, []);
  assert.deepEqual(read({}).parents, []);
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = read({ limit: 1, cursor });
    assert.equal(page.total, 4);
    assert.equal(page.items.length, 1);
    const item = page.items[0];
    seen.push(`${item.kind}:${item.id}`);
    assert.deepEqual(
      page.parents.map((parent) => parent.id),
      item.kind === "task" ? [item.projectId] : [],
    );
    cursor = page.nextCursor || undefined;
  } while (cursor);
  assert.equal(new Set(seen).size, 4);
  assert.deepEqual(read({ q: "no matching title" }).parents, []);
});
test("Cost formatting keeps every digit and the precision entered, without floating-point conversion", () => {
  for (const [raw, display] of [
    ["", ""],
    ["1250000", "1,250,000"],
    ["1250.", "1,250."],
    ["1250.5", "1,250.5"],
    ["1250.50", "1,250.50"],
    ["999999999999.99", "999,999,999,999.99"],
  ]) {
    assert.equal(moneyInputDisplay(raw), display);
    assert.equal(moneyInputValue(display), raw);
  }
  assert.equal(moneyInputValue("1e6"), null);
  assert.equal(moneyInputValue("1.234"), null);
  assert.equal(moneyInputValue("1000000000000"), "1000000000000");
  assert.equal(moneyInputValue("1.250.000,50"), null);
  assert.equal(normalizeMoney(finishMoneyInput("1250.")), "1250.00");
  assert.equal(finishMoneyInput(".5"), "0.5");
});
test("Cost caret placement follows significant input characters rather than inserted commas", () => {
  assert.equal(moneyCaret("1,234.50", 1), 1);
  assert.equal(moneyCaret("1,234.50", 2), 3);
  assert.equal(moneyCaret("1,234.50", 7), 8);
});
