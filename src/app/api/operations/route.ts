import { currentActor } from "@/lib/current-actor";
import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import { operationsCommand, operationsReport } from "@/lib/operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return privateJson(await operationsReport(await currentActor()));
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    return privateJson(
      await operationsCommand(actor, await requestJson(request, 5000)),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
