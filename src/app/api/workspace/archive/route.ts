import { z } from "zod";
import { currentActor } from "@/lib/current-actor";
import { privateJson, apiFailure } from "@/lib/http";
import { readLegacy, listLegacy } from "@/lib/connected/transition";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await currentActor(),
      params = new URL(request.url).searchParams;
    return privateJson(
      params.has("id")
        ? await readLegacy(
            actor,
            z.enum(["project", "task"]).parse(params.get("kind")),
            params.get("id")!,
            {
              childrenPage: z.coerce
                .number()
                .int()
                .min(1)
                .default(1)
                .parse(params.get("childrenPage") ?? undefined),
              historyPage: z.coerce
                .number()
                .int()
                .min(1)
                .default(1)
                .parse(params.get("historyPage") ?? undefined),
            },
          )
        : await listLegacy(actor, Object.fromEntries(params)),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
