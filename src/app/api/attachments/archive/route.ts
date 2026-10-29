import {
  mutationActor,
  requestJson,
  privateJson,
  apiFailure,
} from "@/lib/http";
import { documentManifest } from "@/lib/document-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    return privateJson(
      await documentManifest(
        await mutationActor(request),
        await requestJson(request, 16000),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
