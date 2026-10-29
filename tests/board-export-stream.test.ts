import { test } from "node:test";
import assert from "node:assert/strict";
import * as csv from "../src/lib/board-room/csv";
import {
  projectSchema,
  type ProjectPayload,
} from "../src/lib/board-room/model";
function stream(rows: ProjectPayload[]) {
  assert.ok(
    "projectCSVStream" in csv,
    "CSV exports must offer a streamed response",
  );
  return (
    csv as unknown as {
      projectCSVStream: (rows: ProjectPayload[]) => ReadableStream<Uint8Array>;
    }
  ).projectCSVStream(rows);
}
test("streamed CSV preserves existing quoting, formula protection and links", async () => {
  const rows = [
    {
      ...projectSchema.parse({
        externalId: "STREAM-1",
        name: "=Formula name",
        description: 'Quoted "note"',
        links: ["https://example.com/a"],
        linkLabels: ["A;B"],
      }),
      stage: 3,
      completed: false,
    },
  ];
  assert.equal(
    await new Response(stream(rows)).text(),
    csv.exportProjectCSV(rows),
  );
});
test("large CSV export emits bounded chunks instead of one platform-sized body", async () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({
    ...projectSchema.parse({
      externalId: `STREAM-${i}`,
      name: `Project ${i}`,
      description: "a".repeat(1000),
    }),
    stage: 0,
    completed: false,
  }));
  const reader = stream(rows).getReader();
  let total = 0,
    count = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    assert.ok(value.byteLength <= 65536);
    total += value.byteLength;
    count++;
  }
  assert.ok(total > 4.5 * 1024 * 1024);
  assert.ok(count > 100);
});
