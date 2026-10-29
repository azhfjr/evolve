import { getAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 30;
async function handler(request: Request) {
  try {
    return await (await getAuth()).handler(request);
  } catch (error) {
    console.error(
      "Authentication unavailable:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      {
        message:
          "Google sign-in is not configured yet. Contact the administrator.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export { handler as GET, handler as POST };
