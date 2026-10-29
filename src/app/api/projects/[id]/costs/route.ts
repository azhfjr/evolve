import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
export async function GET() {
  try {
    await currentActor();
    return privateJson(
      {
        error:
          "Expense recording has been retired. Historical records are retained.",
      },
      410,
    );
  } catch (error) {
    return apiFailure(error);
  }
}
