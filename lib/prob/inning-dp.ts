/**
 * Probability that >= 2 of the upcoming batters reach base before 3 outs are recorded.
 *
 * Bayesian-style sequential compounding: track the joint distribution over
 * (outs, reaches_so_far) for each batter. Reaches is capped at 2 (absorbing).
 *
 * Returns P(hit event) where a "hit event" is defined by the user as
 * 2 batters reaching base in the inning.
 */
export function pAtLeastTwoReach(p: number[]): number {
  // dp[outs] = [pReach0, pReach1] — once reach==2 mass is captured into pHitEvent.
  let dp = new Map<number, [number, number]>([[0, [1, 0]]]);
  let pHitEvent = 0;

  for (let i = 0; i < p.length; i++) {
    const pi = Math.max(0, Math.min(1, p[i] ?? 0));
    const next = new Map<number, [number, number]>();
    let stillAlive = false;

    for (const [outs, byR] of dp) {
      if (outs >= 3) continue;
      stillAlive = true;
      for (let r = 0 as 0 | 1; r < 2; r = (r + 1) as 0 | 1) {
        const mass = byR[r];
        if (!mass) continue;
        // Reaches base
        const reachMass = mass * pi;
        if (r + 1 >= 2) {
          pHitEvent += reachMass;
        } else {
          addMass(next, outs, (r + 1) as 0 | 1, reachMass);
        }
        // Out
        addMass(next, outs + 1, r, mass * (1 - pi));
      }
    }

    dp = next;
    if (!stillAlive) break;
    if ([...dp.keys()].every((o) => o >= 3)) break;
  }

  return pHitEvent;
}

function addMass(map: Map<number, [number, number]>, outs: number, r: 0 | 1, mass: number) {
  if (mass <= 0) return;
  const cur = map.get(outs) ?? [0, 0];
  cur[r] += mass;
  map.set(outs, cur);
}

export function pNoHitEvent(p: number[]): number {
  return 1 - pAtLeastTwoReach(p);
}
