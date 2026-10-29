import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshStorylinePages } from "../src/lib/storyline-refresh";
import type { StorylinePage } from "../src/lib/project-storyline";
const page = (start: number, nextCursor: string | null): StorylinePage => ({
  items: Array.from({ length: 50 }, (_, i) => ({
    id: String(start + i),
    documentId: String(start + i),
    filename: `Document ${start + i}`,
    contentType: "text/plain",
    size: 3,
    ownerEmail: "admin@example.test",
    createdAt: "2028-01-01T00:00:00Z",
  })),
  datedCount: 150,
  undatedCount: 0,
  revision: 1,
  nextCursor,
});
test("refresh retains previously loaded pages and their visible document anchor", async () => {
  const result = await refreshStorylinePages(
    async (cursor) =>
      cursor === "page2" ? page(50, "page3") : page(0, "page2"),
    100,
  );
  assert.equal(result.items.length, 100);
  assert.ok(result.items.some((file) => file.id === "80"));
  assert.equal(result.nextCursor, "page3");
});
test("refresh rejects inconsistent or looping page traversal rather than silently losing records", async () => {
  await assert.rejects(
    refreshStorylinePages(
      async (cursor) => ({
        ...page(cursor ? 50 : 0, "same"),
        revision: cursor ? 2 : 1,
      }),
      100,
    ),
    /changed|refresh/i,
  );
});
