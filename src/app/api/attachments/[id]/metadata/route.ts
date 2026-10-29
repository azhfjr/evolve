import {
  apiFailure,
  mutationActor,
  privateJson,
  requestJson,
} from "@/lib/http";
import { updateDocumentMetadata } from "@/lib/project-storyline";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/attachments/[id]/metadata">,
) {
  try {
    return privateJson(
      await updateDocumentMetadata(
        await mutationActor(request),
        (await context.params).id,
        await requestJson(request, 2000),
      ),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function GET(
  _request: Request,
  context: RouteContext<"/api/attachments/[id]/metadata">,
) {
  try {
    const { currentActor } = await import("@/lib/current-actor");
    const { readAttachment, attachmentDto, withDocumentMetadata } =
      await import("@/lib/attachments");
    const file = await readAttachment(
      (await context.params).id,
      await currentActor(),
    );
    if (file.entityType !== "boardRoomProject")
      return privateJson({ error: "Project document not found." }, 404);
    if (!file.isCurrent)
      return privateJson(
        {
          error:
            "Document version changed. Keep your date and reopen the current document before saving.",
        },
        409,
      );
    return privateJson((await withDocumentMetadata([attachmentDto(file)]))[0]);
  } catch (error) {
    return apiFailure(error);
  }
}
