import { connection } from "next/server";
import { PUBSUB_CHANNEL, subscribeToChannel } from "@/lib/pubsub/subscriber";
import { getSnapshot } from "@/lib/pubsub/publisher";

export async function GET(req: Request) {
  await connection();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown, event?: string) => {
        const lines: string[] = [];
        if (event) lines.push(`event: ${event}`);
        lines.push(`data: ${JSON.stringify(data)}`);
        lines.push("", "");
        controller.enqueue(encoder.encode(lines.join("\n")));
      };

      // Hint to EventSource: reconnect after 1s instead of the default 3s.
      controller.enqueue(encoder.encode("retry: 1000\n\n"));

      const abort = new AbortController();
      const cleanup = () => abort.abort();
      req.signal.addEventListener("abort", cleanup);

      // Vercel Fluid Compute kills the function at 300s. Close gracefully 10s
      // early so we exit cleanly (no "Task timed out" error spam) and the
      // browser's EventSource reconnects via its retry hint.
      const preTimeoutClose = setTimeout(cleanup, 290_000);

      const initial = await getSnapshot();
      send({ games: initial }, "snapshot");

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);

      try {
        for await (const update of subscribeToChannel(PUBSUB_CHANNEL, abort.signal)) {
          send(update, "update");
        }
      } catch (err) {
        if (!abort.signal.aborted) send({ error: String(err) }, "error");
      } finally {
        clearInterval(heartbeat);
        clearTimeout(preTimeoutClose);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
