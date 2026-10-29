import { observed } from "@/lib/connected/observability";
import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import { assetCommand, queryAssets } from "@/lib/assets/service";
import { BOARD_IMPORT_LIMIT } from "@/lib/board-room/transport";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await observed("assets.list", async () =>
        queryAssets(
          await currentActor(),
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    return privateJson(
      await assetCommand(
        await mutationActor(request),
        await requestJson(request, BOARD_IMPORT_LIMIT),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
