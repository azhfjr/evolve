import { currentActor } from "@/lib/current-actor";
import {
  privateJson,
  apiFailure,
  mutationActor,
  requestJson,
} from "@/lib/http";
import { boardViewCommand, readBoardViews } from "@/lib/board-room/saved-views";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return privateJson(await readBoardViews(await currentActor()));
  } catch (error) {
    return apiFailure(error);
  }
}
async function change(
  request: Request,
  action: "create" | "update" | "delete",
) {
  try {
    return privateJson(
      await boardViewCommand(
        await mutationActor(request),
        action,
        await requestJson(request, 16000),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  return change(request, "create");
}
export async function PATCH(request: Request) {
  return change(request, "update");
}
export async function DELETE(request: Request) {
  return change(request, "delete");
}
