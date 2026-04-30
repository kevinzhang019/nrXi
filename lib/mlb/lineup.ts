import type { LiveFeed } from "./types";

export type UpcomingHalf = {
  inning: number;
  half: "Top" | "Bottom";
  outs: number;
  pitcherId: number | null;
  battingTeamLabel: "home" | "away";
  upcomingBatterIds: number[];
};

/**
 * Returns the upcoming batters (length 9) starting from the next batter to come up
 * in the current half-inning. If the inning is over (outs===3), returns the
 * batters for the next half-inning starting from where that team left off.
 */
export function getUpcomingForCurrentInning(feed: LiveFeed): UpcomingHalf | null {
  const ls = feed.liveData?.linescore;
  const bx = feed.liveData?.boxscore;
  if (!ls || !bx) return null;

  const inning = ls.currentInning ?? 1;
  const isTop = ls.isTopInning ?? true;
  const outs = ls.outs ?? 0;
  const inningState = (ls.inningState || "").toLowerCase();
  const isMiddleOrEnd = inningState === "middle" || inningState === "end" || outs >= 3;

  const battingTeamLabel: "home" | "away" = isMiddleOrEnd
    ? isTop
      ? "home"
      : "away"
    : isTop
    ? "away"
    : "home";

  const order = bx.teams[battingTeamLabel].battingOrder ?? [];
  if (order.length < 9) return null;

  const pitchers = bx.teams[battingTeamLabel === "home" ? "away" : "home"].pitchers ?? [];
  const pitcherId = ls.defense?.pitcher?.id ?? pitchers[pitchers.length - 1] ?? null;

  let nextSpot = 0;
  if (isMiddleOrEnd) {
    nextSpot = (ls.offense?.battingOrder ?? 0) % 9;
  } else {
    const nextBatterId = ls.offense?.batter?.id;
    const idx = nextBatterId ? order.indexOf(nextBatterId) : 0;
    nextSpot = idx >= 0 ? idx : 0;
  }

  const upcomingBatterIds: number[] = [];
  for (let i = 0; i < 9; i++) upcomingBatterIds.push(order[(nextSpot + i) % 9]);

  return {
    inning: isMiddleOrEnd ? inning + (battingTeamLabel === "away" ? 1 : 0) : inning,
    half: isMiddleOrEnd ? (battingTeamLabel === "away" ? "Top" : "Bottom") : isTop ? "Top" : "Bottom",
    outs: isMiddleOrEnd ? 0 : outs,
    pitcherId,
    battingTeamLabel,
    upcomingBatterIds,
  };
}

export function lineupHash(home: number[] | undefined, away: number[] | undefined): string {
  return `${(home ?? []).join(",")}|${(away ?? []).join(",")}`;
}
