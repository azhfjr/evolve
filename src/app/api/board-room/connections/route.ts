import { observed } from "@/lib/connected/observability";
import { currentActor } from "@/lib/current-actor";
import { privateJson, apiFailure } from "@/lib/http";
import { assetConnections } from "@/lib/assets/explore";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await observed("connections.list", async () =>
        assetConnections(
          await currentActor(),
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
