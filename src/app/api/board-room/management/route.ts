import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { boardManagementData } from "@/lib/board-room/management";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return privateJson(await boardManagementData(await currentActor()));
  } catch (error) {
    return apiFailure(error);
  }
}
