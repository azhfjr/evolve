import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  privateJson,
  mutationActor,
  requestJson,
} from "@/lib/http";
import { readTemplate, templateCommand } from "@/lib/project-template/service";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    const params = new URL(r.url).searchParams;
    return privateJson(
      await readTemplate(
        await currentActor(),
        params.get("id") ?? undefined,
        params.get("manage") === "1",
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(r: Request) {
  try {
    return privateJson(
      await templateCommand(
        await mutationActor(r),
        await requestJson(r, 512000),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
