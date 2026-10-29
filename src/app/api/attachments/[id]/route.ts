import { apiFailure, mutationActor, privateJson } from "@/lib/http";
import { finalizeAttachment, removeAttachment } from "@/lib/attachments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: RouteContext<"/api/attachments/[id]">,
) {
  try {
    return privateJson(
      await finalizeAttachment(
        await mutationActor(request),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/attachments/[id]">,
) {
  try {
    return privateJson(
      await removeAttachment(
        await mutationActor(request),
        (await context.params).id,
        new URL(request.url).searchParams.get("draftId") || undefined,
        new URL(request.url).searchParams.get("pendingOnly") === "1",
      ),
    );
  } catch (e) {
    return apiFailure(e);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/attachments/[id]">,
) {
  try {
    const { labelDocument } = await import("@/lib/document-service");
    const { requestJson } = await import("@/lib/http");
    return privateJson(
      await labelDocument(
        await mutationActor(request),
        (await context.params).id,
        await requestJson(request, 2000),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
