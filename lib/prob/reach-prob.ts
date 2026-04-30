import { clamp } from "../utils";
import type { BatterProfile, PitcherProfile } from "../mlb/splits";

export type EnvFactors = {
  parkRunFactor: number;
  weatherRunFactor: number;
};

export function pitcherPseudoObp(whip: number): number {
  return clamp(whip / 3.5, 0.18, 0.55);
}

export function pReach(
  batter: BatterProfile,
  pitcher: PitcherProfile,
  env: EnvFactors = { parkRunFactor: 1, weatherRunFactor: 1 },
): number {
  let batterObp: number;
  let pitcherWhip: number;

  if (batter.bats === "S") {
    // Switch hitter: use the higher OBP and the higher (=worse for pitcher) WHIP.
    batterObp = Math.max(batter.obpVs.L, batter.obpVs.R);
    pitcherWhip = Math.max(pitcher.whipVs.L, pitcher.whipVs.R);
  } else {
    batterObp = batter.obpVs[pitcher.throws];
    pitcherWhip = pitcher.whipVs[batter.bats];
  }

  const raw = (batterObp + pitcherPseudoObp(pitcherWhip)) / 2;
  const adjusted = raw * env.parkRunFactor * env.weatherRunFactor;
  return clamp(adjusted, 0.05, 0.85);
}
