import { connection } from "next/server";
import { redis } from "@/lib/cache/redis";
import { iterateSnapshotChanges } from "@/lib/pubsub/subscriber";
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

      const initial = await getSnapshot();
      send({ games: initial }, "snapshot");

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);

      const abort = new AbortController();
      req.signal.addEventListener("abort", () => abort.abort());

      try {
        for await (const update of iterateSnapshotChanges(redis(), 2000, abort.signal)) {
          send(update, "update");
        }
      } catch (err) {
        send({ error: String(err) }, "error");
      } finally {
        clearInterval(heartbeat);
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
