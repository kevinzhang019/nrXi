import { describe, expect, it } from "vitest";
import { chooseRecommendedWaitSeconds } from "./fetch-live-diff";
import type { LiveFeed } from "../../lib/mlb/types";

function makeFeed(opts: {
  wait?: number;
  abstract?: string;
  detailed?: string;
  inningState?: string;
  outs?: number;
}): LiveFeed {
  return {
    metaData: { timeStamp: "x", wait: opts.wait },
    gameData: {
      status: {
        abstractGameState: opts.abstract ?? "Live",
        detailedState: opts.detailed,
      },
      teams: {
        away: { id: 1, name: "A" },
        home: { id: 2, name: "B" },
      },
    },
    liveData: {
      linescore: {
        inningState: opts.inningState,
        outs: opts.outs,
      },
      plays: { allPlays: [] },
      boxscore: { teams: { home: { players: {} }, away: { players: {} } } },
    },
  } as unknown as LiveFeed;
}

describe("chooseRecommendedWaitSeconds", () => {
  it("returns a flat 2s during active live PAs", () => {
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ wait: 12, abstract: "Live", inningState: "Top", outs: 1 }),
      ),
    ).toBe(2);
  });

  it("returns 2s during inning breaks too (no 15s break cushion)", () => {
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ wait: 60, abstract: "Live", inningState: "Middle", outs: 0 }),
      ),
    ).toBe(2);
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ wait: 30, abstract: "Live", inningState: "End", outs: 0 }),
      ),
    ).toBe(2);
  });

  it("returns 2s at the 3-out flicker", () => {
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ wait: 30, abstract: "Live", inningState: "Top", outs: 3 }),
      ),
    ).toBe(2);
  });

  it("ignores MLB's metaData.wait hint", () => {
    // Even very large or very small wait hints are clamped to 2s.
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ wait: 120, abstract: "Live", inningState: "Bottom", outs: 1 }),
      ),
    ).toBe(2);
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ wait: 1, abstract: "Live", inningState: "Bottom", outs: 1 }),
      ),
    ).toBe(2);
    expect(
      chooseRecommendedWaitSeconds(
        makeFeed({ abstract: "Live", inningState: "Top", outs: 2 }),
      ),
    ).toBe(2);
  });
});
