import { describe, it, expect } from "vitest";
import { pAtLeastTwoReach, pNoHitEvent } from "./inning-dp";

describe("pAtLeastTwoReach", () => {
  it("returns 0 when nobody reaches", () => {
    expect(pAtLeastTwoReach([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(0, 10);
  });

  it("returns 1 when first three batters all reach with prob 1", () => {
    expect(pAtLeastTwoReach([1, 1, 1])).toBeCloseTo(1, 10);
  });

  it("clamps probabilities to [0,1]", () => {
    expect(pAtLeastTwoReach([1.5, -0.5])).toBeCloseTo(0, 10);
  });

  it("matches Monte Carlo simulation for p=0.3 across 9 batters", () => {
    const p = Array(9).fill(0.3);
    const exact = pAtLeastTwoReach(p);
    const sim = simulate(p, 200_000);
    expect(Math.abs(exact - sim)).toBeLessThan(0.005);
  });

  it("matches Monte Carlo simulation for varied probs", () => {
    const p = [0.4, 0.3, 0.35, 0.28, 0.32, 0.31, 0.29, 0.33, 0.3];
    const exact = pAtLeastTwoReach(p);
    const sim = simulate(p, 200_000);
    expect(Math.abs(exact - sim)).toBeLessThan(0.005);
  });

  it("pNoHitEvent is 1 minus pAtLeastTwoReach", () => {
    const p = [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3];
    expect(pNoHitEvent(p) + pAtLeastTwoReach(p)).toBeCloseTo(1, 10);
  });
});

function simulate(p: number[], trials: number): number {
  let hits = 0;
  for (let t = 0; t < trials; t++) {
    let outs = 0;
    let reaches = 0;
    for (let i = 0; outs < 3 && i < p.length; i++) {
      if (Math.random() < p[i]) reaches++;
      else outs++;
      if (reaches >= 2) break;
    }
    if (reaches >= 2) hits++;
  }
  return hits / trials;
}
