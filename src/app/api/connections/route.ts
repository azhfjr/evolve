import type { NextRequest } from "next/server";
import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { queryConnections } from "@/lib/connections";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    return privateJson(
      await queryConnections(
        await currentActor(),
        request.nextUrl.searchParams,
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
