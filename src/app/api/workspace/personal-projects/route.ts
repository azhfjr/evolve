import { currentActor } from "@/lib/current-actor";
import {
  privateJson,
  mutationActor,
  requestJson,
  apiFailure,
} from "@/lib/http";
import {
  personalProjects,
  personalProjectCommand,
} from "@/lib/connected/personal";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return privateJson(await personalProjects(await currentActor()));
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(r: Request) {
  try {
    return privateJson(
      await personalProjectCommand(
        await mutationActor(r),
        await requestJson(r),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
