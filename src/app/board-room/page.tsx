import { redirect, notFound } from "next/navigation";
import { currentActor } from "@/lib/current-actor";
import { authConfigured } from "@/lib/auth";
import { AppError } from "@/lib/permissions";
import { AccessNotice } from "@/components/access-notice";
import { BoardRoom } from "@/components/board-room/board-room";
import { boardRoomDetail, queryBoardRoom } from "@/lib/board-room/service";
import {
  querySchema,
  type BoardSnapshot,
  type BoardQuery,
} from "@/lib/board-room/model";
import "../board-room.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Kalimantan - Power System Projects" };
export default async function BoardRoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!authConfigured()) return <AccessNotice reason="configuration" />;
  let detail: Awaited<ReturnType<typeof boardRoomDetail>> | undefined;
  let data: BoardSnapshot | undefined,
    query: BoardQuery | undefined,
    failure: unknown;
  const params = await searchParams;
  if (params.section === "meetings") notFound();
  const section =
    typeof params.section === "string" &&
    [
      "map",
      "storyline",
      "costs",
      "project-template",
      "overview",
      "projects",
      "documents",
      "reports",
      "database",
      "assets",
      "connections",
      "quality",
      "settings",
      "people",
      "activity",
      "files",
      "preferences",
      "templates",
    ].includes(params.section)
      ? params.section
      : "overview";
  try {
    query = querySchema.parse(params);
    const actor = await currentActor();
    data = await queryBoardRoom(actor, query);
    if (typeof params.project === "string")
      detail = await boardRoomDetail(actor, params.project);
  } catch (e) {
    failure = e;
  }
  if (data)
    return (
      <BoardRoom
        initialData={data}
        initialProjectId={detail?.project.id}
        initialProjectDetail={detail}
        initialProjectTab={
          [
            "assets",
            "costs",
            "tasks",
            "documents",
            "storyline",
            "activity",
          ].includes(String(params.projectTab))
            ? (params.projectTab as import("@/components/connected/hub").HubTab)
            : "overview"
        }
        initialQuery={query}
        initialSection={section}
      />
    );
  if (failure instanceof AppError && failure.status === 401) redirect("/");
  return (
    <AccessNotice
      reason={
        failure instanceof AppError && failure.status === 403
          ? "denied"
          : "unavailable"
      }
      message={failure instanceof AppError ? failure.message : undefined}
    />
  );
}
