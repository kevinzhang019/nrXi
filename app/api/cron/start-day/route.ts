import { connection } from "next/server";
import { start } from "workflow/api";
import { schedulerWorkflow } from "@/workflows/scheduler";
import { log } from "@/lib/log";

export async function GET(req: Request) {
  await connection();
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const run = await start(schedulerWorkflow);
  log.info("cron", "start-day", { runId: run.runId });
  return Response.json({ ok: true, runId: run.runId });
}
