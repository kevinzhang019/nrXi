import { pAtLeastTwoReach } from "@/lib/prob/inning-dp";
import { pReach } from "@/lib/prob/reach-prob";
import { americanBreakEven, roundOdds } from "@/lib/prob/odds";
import { log } from "@/lib/log";
import type { BatterProfile, PitcherProfile } from "@/lib/mlb/splits";

export type NrsiResult = {
  pHitEvent: number;
  pNoHitEvent: number;
  breakEvenAmerican: number;
  perBatter: Array<{ id: number; name: string; bats: "L" | "R" | "S"; pReach: number }>;
};

export async function computeNrsiStep(opts: {
  gamePk: number;
  pitcher: PitcherProfile;
  batters: BatterProfile[];
  parkRunFactor: number;
  weatherRunFactor: number;
}): Promise<NrsiResult> {
  "use step";
  const { gamePk, pitcher, batters, parkRunFactor, weatherRunFactor } = opts;
  const env = { parkRunFactor, weatherRunFactor };
  const probs = batters.map((b) => pReach(b, pitcher, env));
  const pHit = pAtLeastTwoReach(probs);
  const pNo = 1 - pHit;
  const result: NrsiResult = {
    pHitEvent: pHit,
    pNoHitEvent: pNo,
    breakEvenAmerican: roundOdds(americanBreakEven(pNo)),
    perBatter: batters.map((b, i) => ({ id: b.id, name: b.fullName, bats: b.bats, pReach: probs[i] })),
  };
  log.info("step", "computeNrsi:ok", { gamePk, pHit, pNo, odds: result.breakEvenAmerican });
  return result;
}
