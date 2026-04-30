import { connection } from "next/server";
import { start } from "workflow/api";
import { schedulerWorkflow } from "@/workflows/scheduler";

export async function POST() {
  await connection();
  const run = await start(schedulerWorkflow);
  return Response.json({ runId: run.runId });
}
