import { NextRequest } from "next/server";
import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { activityReport } from "@/lib/workspace-reports";
export async function GET(request: NextRequest) {
  try {
    return privateJson(
      await activityReport(await currentActor(), request.nextUrl.searchParams),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
