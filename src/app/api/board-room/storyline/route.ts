import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { projectStoryline } from "@/lib/project-storyline";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return privateJson(
      await projectStoryline(
        await currentActor(),
        params.get("id") ?? "",
        Object.fromEntries([...params].filter(([k]) => k !== "id")),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
