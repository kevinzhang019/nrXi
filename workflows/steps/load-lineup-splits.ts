import { loadBatterProfile, loadPitcherProfile } from "@/lib/mlb/splits";
import { log } from "@/lib/log";
import type { BatterProfile, PitcherProfile } from "@/lib/mlb/splits";

export async function loadLineupSplitsStep(opts: {
  gamePk: number;
  pitcherId: number;
  batterIds: number[];
}): Promise<{ pitcher: PitcherProfile; batters: BatterProfile[] }> {
  "use step";
  const { gamePk, pitcherId, batterIds } = opts;
  log.info("step", "loadLineupSplits:start", { gamePk, pitcherId, n: batterIds.length });
  const [pitcher, ...batters] = await Promise.all([
    loadPitcherProfile(pitcherId),
    ...batterIds.map((id) => loadBatterProfile(id)),
  ]);
  log.info("step", "loadLineupSplits:ok", { gamePk });
  return { pitcher, batters };
}
