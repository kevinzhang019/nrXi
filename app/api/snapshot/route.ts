import { connection } from "next/server";
import { getSnapshot } from "@/lib/pubsub/publisher";

export async function GET() {
  await connection();
  const games = await getSnapshot();
  games.sort(sortGames);
  return Response.json({ games, ts: new Date().toISOString() });
}

function sortGames(a: { status: string; inning: number | null; updatedAt?: string; startTime?: string }, b: typeof a) {
  const order = { Live: 0, Delayed: 1, Suspended: 2, Pre: 3, Final: 4, Other: 5 } as Record<string, number>;
  const oa = order[a.status] ?? 5;
  const ob = order[b.status] ?? 5;
  if (oa !== ob) return oa - ob;
  if (a.inning !== null && b.inning !== null) return (b.inning ?? 0) - (a.inning ?? 0);
  return 0;
}
