import { z } from "zod";
import {
  apiFailure,
  mutationActor,
  privateJson,
  boundedBody,
} from "@/lib/http";
import { MAX_DOCUMENT, writeLocalAttachment } from "@/lib/attachments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const actor = await mutationActor(request);
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    await writeLocalAttachment(
      actor,
      id,
      await boundedBody(request, MAX_DOCUMENT),
    );
    return privateJson({ ok: true });
  } catch (e) {
    return apiFailure(e);
  }
}
