import { currentActor } from "@/lib/current-actor";
import {
  mutationActor,
  privateJson,
  requestJson,
  apiFailure,
} from "@/lib/http";
import {
  transitionPreview,
  activateConnectedWorkspace,
} from "@/lib/connected/transition";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return privateJson(await transitionPreview(await currentActor()));
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    return privateJson(
      await activateConnectedWorkspace(
        await mutationActor(request),
        await requestJson(request),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
