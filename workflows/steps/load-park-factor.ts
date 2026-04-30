import { getParkRunFactor } from "@/lib/env/park";
import { log } from "@/lib/log";

export async function loadParkFactorStep(opts: {
  gamePk: number;
  homeTeamName: string;
  season: number;
}): Promise<number> {
  "use step";
  const { gamePk, homeTeamName, season } = opts;
  log.info("step", "loadParkFactor:start", { gamePk, homeTeamName, season });
  const f = await getParkRunFactor(homeTeamName, season);
  log.info("step", "loadParkFactor:ok", { gamePk, factor: f });
  return f;
}
