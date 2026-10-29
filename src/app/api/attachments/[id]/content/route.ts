import { currentActor } from "@/lib/current-actor";
import { apiFailure } from "@/lib/http";
import { attachmentContent, readAttachment } from "@/lib/attachments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: RouteContext<"/api/attachments/[id]/content">,
) {
  try {
    const actor = await currentActor();
    const item = await readAttachment((await context.params).id, actor);
    const content = await attachmentContent(item);
    const inline =
      !new URL(request.url).searchParams.has("download") &&
      (item.contentType === "application/pdf" ||
        item.contentType.startsWith("image/"));
    return new Response(content as BodyInit, {
      headers: {
        "Content-Type": item.contentType,
        "Content-Length": String(item.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="download.${item.filename.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(item.filename).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Frame-Options": "DENY",
      },
    });
  } catch (e) {
    return apiFailure(e);
  }
}
