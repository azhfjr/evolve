import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { boardImportHistory } from "@/lib/board-room/import-history";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return privateJson(await boardImportHistory(await currentActor()));
  } catch (error) {
    return apiFailure(error);
  }
}
