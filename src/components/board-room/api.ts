import {
  encodeBoardRequest,
  readBoardResponse,
} from "@/lib/board-room/transport";
export async function boardRequest<T>(body: unknown): Promise<T> {
  return readBoardResponse<T>(
    await fetch("/api/board-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: encodeBoardRequest(body),
    }),
  );
}
export async function boardGet<T>(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<T> {
  return readBoardResponse<T>(
    await fetch(`/api/board-room?${params}`, { cache: "no-store", signal }),
  );
}
