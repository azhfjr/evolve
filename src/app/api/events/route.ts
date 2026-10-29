import { and, eq, sql } from "drizzle-orm";
import { currentActor } from "@/lib/current-actor";
import { database } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { subscribeToChanges } from "@/lib/realtime";
import { apiFailure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    const encoder = new TextEncoder();
    const start = Date.now();
    let cancelled = false;
    let wake: (() => void) | undefined;
    let release: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: string) => {
          if (!cancelled) controller.enqueue(encoder.encode(value));
        };
        const stop = () => {
          cancelled = true;
          wake?.();
          release?.();
        };
        request.signal.addEventListener("abort", stop, { once: true });
        try {
          const subscription = await subscribeToChanges(() => wake?.());
          release = subscription.unsubscribe;
          let previous = Number(
            request.headers.get("last-event-id") ||
              new URL(request.url).searchParams.get("since") ||
              0,
          );
          if (!Number.isSafeInteger(previous) || previous < 0) previous = 0;
          send(
            `retry: 1000\nevent: ready\ndata: ${JSON.stringify({ transport: subscription.connected ? "postgres" : "fallback" })}\n\n`,
          );
          const { db } = await database();
          while (!cancelled && Date.now() - start < 24000) {
            if (
              !actor.isAdmin &&
              !(
                await db
                  .select({ email: s.member.email })
                  .from(s.member)
                  .where(
                    and(
                      eq(s.member.email, actor.email),
                      eq(s.member.disabled, false),
                    ),
                  )
              )[0]
            ) {
              send("event: revoked\ndata: {}\n\n");
              break;
            }
            const [row] = await db
              .select({ revision: s.workspaceSetting.revision })
              .from(s.workspaceSetting)
              .where(eq(s.workspaceSetting.id, "primary"));
            if (row.revision !== previous) {
              const changes = await db.execute(
                sql`SELECT entity,entity_id AS "entityId",revision FROM workspace_change WHERE revision>${previous} ORDER BY revision LIMIT 101`,
              );
              previous = row.revision;
              send(
                `id: ${previous}\nevent: workspace\ndata: ${JSON.stringify({ revision: previous, changes: changes.rows.slice(0, 100), invalidateAll: changes.rows.length > 100 })}\n\n`,
              );
            } else send(": heartbeat\n\n");
            await new Promise<void>((resolve) => {
              const timer = setTimeout(
                () => {
                  wake = undefined;
                  resolve();
                },
                subscription.isConnected() ? 4500 : 1500,
              );
              wake = () => {
                clearTimeout(timer);
                wake = undefined;
                resolve();
              };
              if (cancelled) wake();
            });
          }
        } catch {
          if (!cancelled) send("event: degraded\ndata: {}\n\n");
        } finally {
          request.signal.removeEventListener("abort", stop);
          release?.();
          if (!cancelled) {
            cancelled = true;
            controller.close();
          }
        }
      },
      cancel() {
        cancelled = true;
        wake?.();
        release?.();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return apiFailure(e);
  }
}
