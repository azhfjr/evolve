import { NextRequest } from "next/server";
import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { queryTasks } from "@/lib/task-query";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    return privateJson(
      await queryTasks(await currentActor(), request.nextUrl.searchParams),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
