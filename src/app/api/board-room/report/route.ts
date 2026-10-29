import { currentActor } from "@/lib/current-actor";
import { apiFailure } from "@/lib/http";
import { boardPortfolioReport } from "@/lib/board-room/portfolio-report";
import { renderPortfolioReport } from "@/lib/board-room/report-format";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const report = await boardPortfolioReport(
      await currentActor(),
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return new Response(renderPortfolioReport(report), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
