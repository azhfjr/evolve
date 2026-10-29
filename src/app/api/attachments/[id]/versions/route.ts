import { currentActor } from "@/lib/current-actor";
import {
  privateJson,
  apiFailure,
  mutationActor,
  requestJson,
} from "@/lib/http";
import {
  documentHistory,
  restoreDocumentVersion,
} from "@/lib/document-versions";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  c: RouteContext<"/api/attachments/[id]/versions">,
) {
  try {
    return privateJson(
      await documentHistory(await currentActor(), (await c.params).id),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(
  r: Request,
  c: RouteContext<"/api/attachments/[id]/versions">,
) {
  try {
    return privateJson(
      await restoreDocumentVersion(await mutationActor(r), {
        ...((await requestJson(r)) as object),
        id: (await c.params).id,
      }),
    );
  } catch (e) {
    return apiFailure(e);
  }
}
