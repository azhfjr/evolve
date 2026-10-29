/** Conservative allowance below the hosting platform's 4.5 MB body ceiling. */
export const BOARD_IMPORT_LIMIT = 4 * 1024 * 1024;
export const IMPORT_SIZE_ERROR =
  "Split this CSV into smaller files: the complete encoded import request must fit within 4 MiB.";
export function encodeBoardRequest(body: unknown) {
  const encoded = JSON.stringify(body);
  if (new TextEncoder().encode(encoded).length > BOARD_IMPORT_LIMIT)
    throw new Error(IMPORT_SIZE_ERROR);
  return encoded;
}
export async function readBoardResponse<T>(response: Response): Promise<T> {
  if (response.status === 413) throw new Error(IMPORT_SIZE_ERROR);
  let data: { error?: unknown };
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Board Room is temporarily unavailable. Please retry; your changes have not been confirmed.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Board Room is temporarily unavailable. Please retry.",
    );
  return data as T;
}
