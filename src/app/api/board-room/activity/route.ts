import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  privateJson,
  mutationActor,
  requestJson,
} from "@/lib/http";
import {
  boardActivityReport,
  deleteBoardActivities,
} from "@/lib/board-room/management";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await boardActivityReport(
        await currentActor(),
        new URL(request.url).searchParams,
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    return privateJson(
      await deleteBoardActivities(
        await mutationActor(request),
        await requestJson(request, 6000),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
