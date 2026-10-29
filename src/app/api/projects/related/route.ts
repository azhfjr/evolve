import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { relatedRoomProjects } from "@/lib/project-room-links";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return privateJson(
      await relatedRoomProjects(
        await currentActor(),
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
