import { connection } from "next/server";
import { start } from "workflow/api";
import { gameWatcherWorkflow } from "@/workflows/game-watcher";

export async function POST(req: Request) {
  await connection();
  const body = (await req.json()) as {
    gamePk: number;
    awayTeamName: string;
    homeTeamName: string;
  };
  const ownerId = `watcher-manual-${body.gamePk}-${Date.now()}`;
  const run = await start(gameWatcherWorkflow, [{ ...body, ownerId }]);
  return Response.json({ runId: run.runId });
}
