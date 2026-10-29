import { currentActor } from "@/lib/current-actor";
import { privateJson, apiFailure } from "@/lib/http";
import { personalActions } from "@/lib/connected/workspace";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await personalActions(
        await currentActor(),
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
