import { describe, it, expect } from "vitest";
import { pReach, pitcherPseudoObp } from "./reach-prob";
import type { BatterProfile, PitcherProfile } from "../mlb/splits";

const rhpHardThrower: PitcherProfile = {
  id: 1,
  fullName: "Test Pitcher",
  throws: "R",
  whipVs: { L: 1.1, R: 0.9 },
  obpVs: { L: 0.31, R: 0.27 },
};

const lhpControl: PitcherProfile = {
  id: 2,
  fullName: "Lefty",
  throws: "L",
  whipVs: { L: 0.85, R: 1.4 },
  obpVs: { L: 0.26, R: 0.34 },
};

const rhBatter: BatterProfile = {
  id: 10,
  fullName: "RH Bat",
  bats: "R",
  obpVs: { L: 0.36, R: 0.32 },
};

const lhBatter: BatterProfile = {
  id: 11,
  fullName: "LH Bat",
  bats: "L",
  obpVs: { L: 0.28, R: 0.36 },
};

const switchBatter: BatterProfile = {
  id: 12,
  fullName: "Switch",
  bats: "S",
  obpVs: { L: 0.30, R: 0.40 },
};

describe("pitcherPseudoObp", () => {
  it("clamps to [0.18, 0.55]", () => {
    expect(pitcherPseudoObp(0.5)).toBeCloseTo(0.18, 6);
    expect(pitcherPseudoObp(3.0)).toBeCloseTo(0.55, 6);
  });

  it("divides by 3.5 in middle range", () => {
    expect(pitcherPseudoObp(1.4)).toBeCloseTo(0.4, 6);
  });
});

describe("pReach handedness routing", () => {
  it("uses batter's vsR OBP and pitcher's vsR WHIP for RHB vs RHP", () => {
    const v = pReach(rhBatter, rhpHardThrower);
    const expected = (rhBatter.obpVs.R + pitcherPseudoObp(rhpHardThrower.whipVs.R)) / 2;
    expect(v).toBeCloseTo(expected, 6);
  });

  it("uses batter's vsL OBP and pitcher's vsR WHIP for LHB vs LHP", () => {
    const v = pReach(lhBatter, lhpControl);
    const expected = (lhBatter.obpVs.L + pitcherPseudoObp(lhpControl.whipVs.L)) / 2;
    expect(v).toBeCloseTo(expected, 6);
  });

  it("switch hitter takes max of both OBPs and max of both pitcher WHIPs", () => {
    const v = pReach(switchBatter, lhpControl);
    const expectedObp = Math.max(switchBatter.obpVs.L, switchBatter.obpVs.R);
    const expectedWhip = Math.max(lhpControl.whipVs.L, lhpControl.whipVs.R);
    const expected = (expectedObp + pitcherPseudoObp(expectedWhip)) / 2;
    expect(v).toBeCloseTo(expected, 6);
  });

  it("env factors multiply", () => {
    const baseline = pReach(rhBatter, rhpHardThrower);
    const boosted = pReach(rhBatter, rhpHardThrower, {
      parkRunFactor: 1.1,
      weatherRunFactor: 1.05,
    });
    expect(boosted).toBeGreaterThan(baseline);
  });

  it("clamps result to [0.05, 0.85]", () => {
    const extreme: PitcherProfile = {
      id: 99,
      fullName: "Garbage",
      throws: "R",
      whipVs: { L: 5.0, R: 5.0 },
      obpVs: { L: 0.6, R: 0.6 },
    };
    const v = pReach(rhBatter, extreme, { parkRunFactor: 1.5, weatherRunFactor: 1.2 });
    expect(v).toBeLessThanOrEqual(0.85);
  });
});
