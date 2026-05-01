import { describe, it, expect } from "vitest";
import { xSlgFromPa, xObpFromPa } from "./expected-stats";
import type { PaOutcomes } from "../mlb/splits";

function pa(partial: Partial<PaOutcomes>): PaOutcomes {
  const base: PaOutcomes = {
    single: 0,
    double: 0,
    triple: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    k: 0,
    ipOut: 0,
    ...partial,
  };
  const sum =
    base.single + base.double + base.triple + base.hr +
    base.bb + base.hbp + base.k + base.ipOut;
  // pad ipOut so the multinomial sums to exactly 1
  return { ...base, ipOut: base.ipOut + (1 - sum) };
}

describe("xSlgFromPa", () => {
  it("returns 4.0 when every PA is an HR (max possible)", () => {
    const out = pa({ hr: 1, ipOut: 0 });
    out.ipOut = 0; // override the auto-pad
    expect(xSlgFromPa(out)).toBeCloseTo(4.0, 6);
  });

  it("returns 0 when there are no hits", () => {
    expect(xSlgFromPa(pa({ k: 0.3, bb: 0.1 }))).toBe(0);
  });

  it("matches the closed form: bases / (1 - bb - hbp)", () => {
    const p = pa({
      single: 0.15,
      double: 0.05,
      triple: 0.005,
      hr: 0.03,
      bb: 0.08,
      hbp: 0.01,
      k: 0.22,
    });
    const bases = 0.15 + 2 * 0.05 + 3 * 0.005 + 4 * 0.03;
    const abShare = 1 - 0.08 - 0.01;
    expect(xSlgFromPa(p)).toBeCloseTo(bases / abShare, 9);
  });

  it("excludes walks and HBPs from the denominator (a walk does not depress xSLG)", () => {
    const noWalks = pa({ single: 0.2, k: 0.2, ipOut: 0.6 });
    const withWalks = pa({ single: 0.2, bb: 0.1, k: 0.1, ipOut: 0.6 });
    // Same single rate, more walks shouldn't reduce xSLG below the walk-less case.
    expect(xSlgFromPa(withWalks)).toBeGreaterThanOrEqual(xSlgFromPa(noWalks) - 1e-9);
  });

  it("guards against a degenerate all-walk PA (no divide-by-zero)", () => {
    const p = pa({ bb: 1, ipOut: 0 });
    p.ipOut = 0;
    expect(Number.isFinite(xSlgFromPa(p))).toBe(true);
    expect(xSlgFromPa(p)).toBe(0);
  });
});

describe("xObpFromPa", () => {
  it("equals 1 - k - ipOut", () => {
    const p = pa({ single: 0.2, bb: 0.1, k: 0.25, ipOut: 0.4 });
    expect(xObpFromPa(p)).toBeCloseTo(1 - p.k - p.ipOut, 9);
  });

  it("matches the sum of all reach outcomes", () => {
    const p = pa({
      single: 0.15,
      double: 0.05,
      triple: 0.005,
      hr: 0.03,
      bb: 0.08,
      hbp: 0.01,
      k: 0.22,
    });
    const reachSum = p.single + p.double + p.triple + p.hr + p.bb + p.hbp;
    expect(xObpFromPa(p)).toBeCloseTo(reachSum, 9);
  });
});
