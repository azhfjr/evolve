import { redirect } from "next/navigation";
import { currentActor } from "@/lib/current-actor";
import { AccessNotice } from "@/components/access-notice";
import { BoardRoom } from "@/components/board-room/board-room";
import { boardRoomDetail, queryBoardRoom } from "@/lib/board-room/service";
import type { BoardSnapshot, BoardDetail } from "@/lib/board-room/model";
import { AppError } from "@/lib/permissions";
import "../../../board-room.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Board Room project" };
export default async function BoardProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tab = (await searchParams).projectTab;
  const projectTab = [
    "overview",
    "assets",
    "costs",
    "tasks",
    "documents",
    "storyline",
    "activity",
  ].includes(tab ?? "")
    ? (tab as import("@/components/connected/hub").HubTab)
    : "overview";
  let data: BoardSnapshot | undefined,
    detail: BoardDetail | undefined,
    id: string | undefined,
    failure: unknown;
  try {
    const actor = await currentActor();
    id = (await params).id;
    [detail, data] = await Promise.all([
      boardRoomDetail(actor, id),
      queryBoardRoom(actor, {}),
    ]);
  } catch (e) {
    failure = e;
  }
  if (data)
    return (
      <BoardRoom
        initialData={data}
        initialProjectTab={projectTab}
        initialProjectId={id}
        initialProjectDetail={detail}
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
