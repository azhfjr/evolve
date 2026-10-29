import type { StorylinePage } from "./project-storyline";
/** Refill only the pages already explored, keeping the rendered list stable. */
export async function refreshStorylinePages(
  load: (cursor?: string) => Promise<StorylinePage>,
  minimum: number,
): Promise<StorylinePage> {
  const first = await load();
  let result = first;
  const seen = new Set<string>();
  while (result.nextCursor && result.items.length < minimum) {
    const cursor = result.nextCursor;
    if (seen.has(cursor))
      throw Error("Documents changed. Refresh the Storyline.");
    seen.add(cursor);
    const next = await load(cursor);
    if (next.revision !== first.revision)
      throw Error("Documents changed. Refresh the Storyline.");
    result = { ...next, items: [...result.items, ...next.items] };
  }
  return result;
}
