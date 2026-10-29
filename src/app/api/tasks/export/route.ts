import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { currentActor } from "@/lib/current-actor";
import { apiFailure } from "@/lib/http";
import { queryTasks } from "@/lib/task-query";
import { csvExport } from "@/lib/utils";
import { database } from "@/lib/db";
import { assertActorActive } from "@/lib/membership";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const actor = await currentActor();
    const { db } = await database();
    const parameters = new URLSearchParams(request.nextUrl.searchParams);
    parameters.delete("cursor");
    parameters.set("limit", "500");
    const ready = Promise.withResolvers<void>();
    const encoder = new TextEncoder();
    let cancelled = false;
    let resume: (() => void) | undefined;
    const stop = () => {
      cancelled = true;
      resume?.();
    };
    request.signal.addEventListener("abort", stop, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          resume?.();
        }, 45000);
        try {
          // One consistent snapshot avoids skipped or duplicated rows when
          // another user changes a sort key while a large export is streaming.
          await db.transaction(async (tx) => {
            await tx.execute(
              sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`,
            );
            await tx.execute(sql`SET LOCAL statement_timeout='15s'`);
            let page = await queryTasks(actor, parameters, tx);
            ready.resolve();
            let initial = true;
            while (!cancelled) {
              if (timedOut) throw new Error("ExportTimeout");
              await assertActorActive(db, actor);
              const lines = csvExport(page.tasks);
              controller.enqueue(
                encoder.encode(
                  initial
                    ? "\ufeff" + lines
                    : "\r\n" + lines.split("\r\n").slice(1).join("\r\n"),
                ),
              );
              initial = false;
              if (!page.nextCursor) break;
              if ((controller.desiredSize || 0) <= 0)
                await new Promise<void>((resolve) => {
                  resume = resolve;
                  if (cancelled || timedOut) resolve();
                });
              resume = undefined;
              if (cancelled) break;
              if (timedOut) throw new Error("ExportTimeout");
              parameters.set("cursor", page.nextCursor);
              page = await queryTasks(actor, parameters, tx);
            }
          });
          if (!cancelled) controller.close();
        } catch (error) {
          ready.reject(error);
          if (!cancelled) controller.error(error);
        } finally {
          clearTimeout(timeout);
          request.signal.removeEventListener("abort", stop);
        }
      },
      pull() {
        resume?.();
      },
      cancel() {
        stop();
      },
    });
    await ready.promise;
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="evolve-tasks-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiFailure(e);
  }
}
