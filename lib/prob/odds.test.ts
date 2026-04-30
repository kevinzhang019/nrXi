import { describe, it, expect } from "vitest";
import { americanBreakEven, impliedProb, roundOdds } from "./odds";

describe("americanBreakEven", () => {
  it("returns ±100 at q=0.5", () => {
    expect(americanBreakEven(0.5)).toBe(-100);
  });

  it("returns negative odds for q > 0.5", () => {
    const odds = americanBreakEven(0.75);
    expect(odds).toBe(-300);
  });

  it("returns positive odds for q < 0.5", () => {
    const odds = americanBreakEven(0.25);
    expect(odds).toBe(300);
  });

  it("round-trips through impliedProb for varied q", () => {
    for (const q of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const odds = americanBreakEven(q);
      expect(impliedProb(odds)).toBeCloseTo(q, 6);
    }
  });
});

describe("impliedProb", () => {
  it("converts +100 to 0.5", () => {
    expect(impliedProb(100)).toBeCloseTo(0.5, 6);
  });

  it("converts -200 to 2/3", () => {
    expect(impliedProb(-200)).toBeCloseTo(2 / 3, 6);
  });
});

describe("roundOdds", () => {
  it("rounds to nearest 5", () => {
    expect(roundOdds(123)).toBe(125);
    expect(roundOdds(-187)).toBe(-185);
  });
});
