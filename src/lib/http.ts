import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, checkMutationOrigin } from "./permissions";
import { serverLocale } from "./i18n/server";
import { getTranslator } from "./i18n/core";
import { validationSummary } from "./i18n/validation";
import { currentActor } from "./current-actor";
export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function apiFailure(error: unknown) {
  const locale = await serverLocale();
  const t = getTranslator(locale);
  if (error instanceof AppError)
    return privateJson({ error: t(error.message) }, error.status);
  if (error instanceof ZodError)
    return privateJson(
      {
        error: validationSummary(error.issues, locale),
      },
      400,
    );
  console.error(
    "API request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return privateJson(
    { error: t("Permintaan belum dapat diselesaikan. Silakan coba lagi.") },
    500,
  );
}
export async function mutationActor(request: Request) {
  checkMutationOrigin(
    request.headers.get("origin"),
    process.env.BETTER_AUTH_URL || new URL(request.url).origin,
  );
  return currentActor();
}
export async function boundedBody(request: Request, limit = 100000) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new AppError("Ukuran permintaan terlalu besar.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError("Ukuran permintaan terlalu besar.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function requestJson(
  request: Request,
  limit = 100000,
): Promise<unknown> {
  try {
    return JSON.parse(
      new TextDecoder().decode(await boundedBody(request, limit)),
    );
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Format JSON tidak valid.", 400);
  }
}
