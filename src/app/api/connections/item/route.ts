import { z } from "zod";
import { currentActor } from "@/lib/current-actor";
import { connectionEntity } from "@/lib/connections";
import { apiFailure, privateJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = z
      .object({ id: z.uuid(), kind: z.enum(["task", "project"]) })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return privateJson(
      await connectionEntity(await currentActor(), query.kind, query.id),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
