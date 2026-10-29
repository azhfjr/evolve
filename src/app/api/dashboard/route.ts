import { NextRequest } from "next/server";
import { currentActor } from "@/lib/current-actor";
import { apiFailure, privateJson } from "@/lib/http";
import { dashboardReport } from "@/lib/workspace-reports";
export async function GET(request: NextRequest) {
  try {
    return privateJson(
      await dashboardReport(
        await currentActor(),
        Number(request.nextUrl.searchParams.get("days") || 30),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
