import { observed } from "@/lib/connected/observability";
import { currentActor } from "@/lib/current-actor";
import { privateJson, apiFailure } from "@/lib/http";
import { projectHub } from "@/lib/connected/workspace";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    return privateJson(
      await observed("project.hub", async () =>
        projectHub(
          await currentActor(),
          new URL(r.url).searchParams.get("id") || "",
          new URL(r.url).searchParams.get("tasks") !== "0",
        ),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
