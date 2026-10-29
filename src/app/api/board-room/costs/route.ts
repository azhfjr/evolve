import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  privateJson,
  mutationActor,
  requestJson,
} from "@/lib/http";
import { projectCosts, saveProjectCosts } from "@/lib/board-room/costs";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    return privateJson(
      await projectCosts(
        await currentActor(),
        new URL(r.url).searchParams.get("id") ?? "",
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(r: Request) {
  try {
    const actor = await mutationActor(r),
      id = new URL(r.url).searchParams.get("id") ?? "";
    return privateJson(
      await saveProjectCosts(actor, id, await requestJson(r, 64000)),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
