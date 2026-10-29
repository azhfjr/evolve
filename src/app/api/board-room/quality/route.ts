import { currentActor } from "@/lib/current-actor";
import { privateJson, apiFailure } from "@/lib/http";
import { assetQuality } from "@/lib/assets/explore";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await assetQuality(
        await currentActor(),
        Number(new URL(request.url).searchParams.get("page") || 1),
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
