import { NextRequest } from "next/server";
import { currentActor } from "@/lib/current-actor";
import {
  mutationActor,
  apiFailure,
  privateJson,
  requestJson,
} from "@/lib/http";
import { fileInventory, deleteManagedFiles } from "@/lib/file-management";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    return privateJson(
      await fileInventory(
        await currentActor(),
        Object.fromEntries(request.nextUrl.searchParams),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    return privateJson(
      await deleteManagedFiles(
        await mutationActor(request),
        await requestJson(request, 6000),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
