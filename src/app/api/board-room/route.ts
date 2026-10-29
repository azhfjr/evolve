import {
  canonicalProjectImport,
  canonicalProjectExport,
  canonicalCSVStream,
} from "@/lib/connected/project-csv";
import { BOARD_IMPORT_LIMIT } from "@/lib/board-room/transport";
import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  privateJson,
  mutationActor,
  requestJson,
} from "@/lib/http";
import {
  boardRoomCommand,
  queryBoardRoom,
  boardRoomDetail,
} from "@/lib/board-room/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    const params = new URL(request.url).searchParams;
    if (params.has("id"))
      return privateJson(await boardRoomDetail(actor, params.get("id")!));
    const query = Object.fromEntries(
      [...params].filter(([key]) => key !== "export"),
    );
    if (params.get("export") === "csv")
      return new Response(
        canonicalCSVStream(await canonicalProjectExport(actor, query)),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="board-room-projects.csv"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    return privateJson(await queryBoardRoom(actor, query));
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    const input = await requestJson(request, BOARD_IMPORT_LIMIT);
    return privateJson(
      typeof (input as { action?: string }).action === "string" &&
        (input as { action: string }).action.startsWith("canonical")
        ? await canonicalProjectImport(actor, input)
        : await boardRoomCommand(actor, input),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
