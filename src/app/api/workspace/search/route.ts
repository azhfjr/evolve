import { observed } from "@/lib/connected/observability";
import { currentActor } from "@/lib/current-actor";
import { privateJson, apiFailure } from "@/lib/http";
import { unifiedSearch } from "@/lib/connected/workspace";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    return privateJson(
      await observed("search", async () =>
        unifiedSearch(
          await currentActor(),
          Object.fromEntries(new URL(r.url).searchParams),
        ),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
