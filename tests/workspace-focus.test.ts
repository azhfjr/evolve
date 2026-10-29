import { test } from "node:test";
import assert from "node:assert/strict";
import { focusDate, focusLinks } from "../src/lib/workspace-focus";

test("Home focus uses the account timezone at midnight rather than UTC", () => {
  const instant = new Date("2026-10-24T18:30:00Z");
  assert.equal(focusDate("Asia/Jakarta", instant), "2026-10-25");
  assert.equal(focusDate("America/Los_Angeles", instant), "2026-10-24");
});

test("Home attention links preserve exact task and Board filters", () => {
  const links = focusLinks("operator+grid@example.com");
  const mine = new URL(links.myOpen, "https://example.com");
  assert.equal(mine.searchParams.get("assignee"), "operator+grid@example.com");
  assert.equal(mine.searchParams.get("open"), "true");
  const overdue = new URL(links.overdue, "https://example.com");
  assert.equal(overdue.searchParams.get("dueBucket"), "overdue");
  assert.equal(overdue.searchParams.get("open"), "true");
  assert.equal(
    new URL(links.needsReview, "https://example.com").searchParams.get(
      "validation",
    ),
    "review",
  );
  assert.equal(
    new URL(links.incomplete, "https://example.com").searchParams.get(
      "attention",
    ),
    "incomplete",
  );
});
