import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { administrationReport } from "@/lib/workspace-reports";
export async function GET() {
  try {
    return privateJson(await administrationReport(await currentActor()));
  } catch (error) {
    return apiFailure(error);
  }
}
