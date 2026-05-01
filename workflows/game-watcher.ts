import { sleep } from "workflow";
import { acquireWatcherLockStep, refreshWatcherLockStep } from "./steps/lock";
import { fetchLiveDiffStep } from "./steps/fetch-live-diff";
import { loadLineupSplitsStep } from "./steps/load-lineup-splits";
import { loadParkFactorStep } from "./steps/load-park-factor";
import { loadWeatherStep } from "./steps/load-weather";
import { loadDefenseStep } from "./steps/load-defense";
import { computeNrXiStep } from "./steps/compute-nrXi";
import { computeLineupStatsStep } from "./steps/compute-lineup-stats";
import { publishUpdateStep } from "./steps/publish-update";
import { enrichLineupHandsStep } from "./steps/enrich-lineup-hands";
import { getUpcomingForCurrentInning, lineupHash } from "@/lib/mlb/lineup";
import { extractLineups, extractLinescore, extractBatterFocus } from "@/lib/mlb/extract";
import { isDecisionMoment, type GameState, type LineupBatterStat } from "@/lib/state/game-state";
import { classifyStatus } from "@/lib/mlb/types";
import { americanBreakEven, roundOdds } from "@/lib/prob/odds";
import type { LiveFeed } from "@/lib/mlb/types";
import type { Bases, GameState as MarkovState } from "@/lib/prob/markov";

// Read live (outs, bases) from the MLB feed. Bases use the canonical 3-bit
// encoding shared with the Markov chain (bit0=1st, bit1=2nd, bit2=3rd).
function readMarkovStartState(feed: LiveFeed): MarkovState {
  const ls = feed.liveData.linescore;
  const o = ls.outs ?? 0;
  const outs = (o >= 3 ? 0 : o) as 0 | 1 | 2; // mid-change-of-innings: outs may briefly hit 3
  const off = ls.offense ?? {};
  const b1 = off.first?.id ? 1 : 0;
  const b2 = off.second?.id ? 2 : 0;
  const b3 = off.third?.id ? 4 : 0;
  return { outs, bases: ((b1 | b2 | b3) as Bases) };
}

// Read this pitcher's cumulative batters-faced from the boxscore for TTOP.
function readPaInGameForPitcher(feed: LiveFeed, pitcherId: number): number {
  const teams = feed.liveData.boxscore?.teams;
  if (!teams) return 0;
  const key = `ID${pitcherId}`;
  const fromHome = teams.home.players?.[key]?.stats?.pitching?.battersFaced;
  const fromAway = teams.away.players?.[key]?.stats?.pitching?.battersFaced;
  return fromHome ?? fromAway ?? 0;
}

// Pull current-season ERA / WHIP from the boxscore so the card header can
// surface them next to the pitcher's name. MLB returns these as strings.
function readPitcherSeasonStats(
  feed: LiveFeed,
  pitcherId: number,
): { era: number | null; whip: number | null } {
  const teams = feed.liveData.boxscore?.teams;
  if (!teams) return { era: null, whip: null };
  const key = `ID${pitcherId}`;
  const p = teams.home.players?.[key] ?? teams.away.players?.[key];
  const s = p?.seasonStats?.pitching;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  return { era: num(s?.era), whip: num(s?.whip) };
}

// Read the live defensive alignment for v2.1 (catcher framing + fielder OAA).
// Returns null catcher / empty fielders if the feed hasn't populated yet —
// computeNrXiStep degrades gracefully to v2 behavior in that case.
function readDefenseAlignment(feed: LiveFeed): {
  catcherId: number | null;
  fielderIds: number[];
} {
  const d = feed.liveData.linescore.defense;
  if (!d) return { catcherId: null, fielderIds: [] };
  const catcherId = d.catcher?.id ?? null;
  const fielderIds: number[] = [];
  for (const k of ["first", "second", "third", "shortstop", "left", "center", "right"] as const) {
    const id = d[k]?.id;
    if (id) fielderIds.push(id);
  }
  return { catcherId, fielderIds };
}

function defenseAlignmentKey(catcherId: number | null, fielderIds: number[]): string {
  return `${catcherId ?? "_"}-${fielderIds.join(",")}`;
}

// The "current pitcher" for each side. While their team is fielding, this is
// the pitcher actually on the mound (last entry of pitchers[]). Otherwise it's
// the most-recently-listed pitcher (starter pre-game; latest reliever if they
// already pitched). Returns null when the boxscore array is empty (very early
// pre-game with no probable starter posted yet).
function readBothPitchers(feed: LiveFeed): {
  awayPitcherId: number | null;
  homePitcherId: number | null;
} {
  const teams = feed.liveData.boxscore?.teams;
  const ap = teams?.away.pitchers ?? [];
  const hp = teams?.home.pitchers ?? [];
  return {
    awayPitcherId: ap[ap.length - 1] ?? null,
    homePitcherId: hp[hp.length - 1] ?? null,
  };
}

// Pull the 9 starter ids out of an enriched lineup. Returns null when the
// lineup hasn't posted yet (length < 9). Only starters; in-game subs are
// already handled by the at-bat-side compute path.
function starterIdsOf(lineup: { starter: { id: number } }[] | null): number[] | null {
  if (!lineup || lineup.length < 9) return null;
  return lineup.slice(0, 9).map((s) => s.starter.id);
}

export type WatcherInput = {
  gamePk: number;
  ownerId: string;
  awayTeamName: string;
  homeTeamName: string;
};

const SEASON = new Date().getUTCFullYear();
const MAX_LOOPS = 1500;

export async function gameWatcherWorkflow(input: WatcherInput) {
  "use workflow";
  console.log("[watcher] start", input.gamePk);

  const owned = await acquireWatcherLockStep({
    gamePk: input.gamePk,
    ownerId: input.ownerId,
    ttlSeconds: 90,
  });
  if (!owned) {
    console.log("[watcher] lock held by other; exiting", input.gamePk);
    return { reason: "lock-held" };
  }

  let lastTimecode: string | null = null;
  let prevDoc: LiveFeed | null = null;
  let lastInningKey = "";
  let lastLineupHash = "";
  let lastDefenseKey = "";
  // Cached enriched lineups + the lineup hash they were enriched from. We
  // hydrate batter handedness from /people/{id} (via loadHand, 30d Redis TTL)
  // because the live-feed boxscore omits batSide for most players. Recomputed
  // only when the boxscore battingOrder changes (sub or starter swap).
  let lastEnrichedHash = "";
  let lastLineups: Awaited<ReturnType<typeof enrichLineupHandsStep>> | null = null;
  let lastNrXi: Awaited<ReturnType<typeof computeNrXiStep>> | null = null;
  let lastEnv: { parkRunFactor: number; weatherRunFactor: number; weather?: Record<string, unknown> } | null = null;
  let lastPitcherId: number | null = null;
  let lastPitcherName = "";
  let lastPitcherThrows: "L" | "R" = "R";
  let lastPitcherEra: number | null = null;
  let lastPitcherWhip: number | null = null;
  // Full-inning probability — composed of (rest-of-current-half) × (clean
  // opposite half). Null when half=Top and the opposing pitcher is unknown,
  // so the UI shows "—" instead of silently falling through.
  let lastFullInning: { pHit: number; pNo: number; breakEven: number } | null = null;
  // Display-only xOBP/xSLG for both teams' starters keyed by player id. Drives
  // the "one team at a time" view that surfaces stats for all 9 batters of
  // either team. Hoisted to workflow scope (bug #5/#7 pattern) so it persists
  // across non-recompute ticks.
  let lastLineupStats: GameState["lineupStats"] = null;
  let lastOppPitcherHash = "";

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const tick = await fetchLiveDiffStep({
      gamePk: input.gamePk,
      startTimecode: lastTimecode,
      prevDoc,
    });
    lastTimecode = tick.newTimecode;
    prevDoc = tick.feed;

    const status = classifyStatus(
      tick.feed.gameData.status.detailedState,
      tick.feed.gameData.status.abstractGameState,
    );
    const ls = tick.feed.liveData.linescore;
    const inning = ls.currentInning ?? null;
    const half: "Top" | "Bottom" | null =
      ls.isTopInning === true ? "Top" : ls.isTopInning === false ? "Bottom" : null;
    const outs = ls.outs ?? null;
    const inningState = ls.inningState ?? "";

    const inningKey = `${inning}-${half}-${(outs ?? 0) >= 3 ? "end" : inningState || "live"}`;
    const lh = lineupHash(
      tick.feed.liveData.boxscore?.teams.home.battingOrder,
      tick.feed.liveData.boxscore?.teams.away.battingOrder,
    );
    const alignment = readDefenseAlignment(tick.feed);
    const dk = defenseAlignmentKey(alignment.catcherId, alignment.fielderIds);
    const upcoming = getUpcomingForCurrentInning(tick.feed);
    const bothPitchers = readBothPitchers(tick.feed);
    const op = `${bothPitchers.awayPitcherId ?? "_"}-${bothPitchers.homePitcherId ?? "_"}`;

    const shouldRecompute =
      status === "Live" &&
      upcoming !== null &&
      upcoming.pitcherId !== null &&
      (inningKey !== lastInningKey ||
        lh !== lastLineupHash ||
        dk !== lastDefenseKey ||
        op !== lastOppPitcherHash);

    console.log(
      "[watcher] tick",
      JSON.stringify({
        gamePk: input.gamePk,
        status,
        inningKey,
        upcoming: upcoming
          ? { pitcherId: upcoming.pitcherId, batters: upcoming.upcomingBatterIds.length }
          : null,
        shouldRecompute,
      }),
    );

    // Hydrate lineup batter handedness from /people/{id} when the boxscore
    // battingOrder changes. Done BEFORE the recompute block so lastLineups is
    // available for starter id lookup. Independent of shouldRecompute so
    // Pre-game lineups (status !== "Live") still get hydrated as soon as they
    // post.
    if (lh !== lastEnrichedHash) {
      const rawLineups = extractLineups(tick.feed);
      lastLineups = await enrichLineupHandsStep({
        gamePk: input.gamePk,
        lineups: rawLineups,
      });
      lastEnrichedHash = lh;
    }

    if (shouldRecompute && upcoming) {
      const [splits, park, weather, defense] = await Promise.all([
        loadLineupSplitsStep({
          gamePk: input.gamePk,
          pitcherId: upcoming.pitcherId!,
          batterIds: upcoming.upcomingBatterIds,
        }),
        loadParkFactorStep({
          gamePk: input.gamePk,
          homeTeamName: input.homeTeamName,
          season: SEASON,
        }),
        loadWeatherStep({
          gamePk: input.gamePk,
          awayTeam: input.awayTeamName,
          homeTeam: input.homeTeamName,
        }),
        loadDefenseStep({ gamePk: input.gamePk, season: SEASON }),
      ]);
      const startState = readMarkovStartState(tick.feed);
      const paInGameForPitcher = readPaInGameForPitcher(tick.feed, upcoming.pitcherId!);
      lastNrXi = await computeNrXiStep({
        gamePk: input.gamePk,
        pitcher: splits.pitcher,
        batters: splits.batters,
        park: park.components,
        weather: weather.components,
        startState,
        paInGameForPitcher,
        oaaTable: defense.oaaTable,
        framingTable: defense.framingTable,
        catcherId: alignment.catcherId,
        fielderIds: alignment.fielderIds,
      });
      lastEnv = {
        parkRunFactor: park.runFactor,
        weatherRunFactor: weather.factor,
        weather: weather.info as unknown as Record<string, unknown>,
      };
      lastPitcherId = splits.pitcher.id;
      lastPitcherName = splits.pitcher.fullName;
      lastPitcherThrows = splits.pitcher.throws;
      const seasonStats = readPitcherSeasonStats(tick.feed, splits.pitcher.id);
      lastPitcherEra = seasonStats.era;
      lastPitcherWhip = seasonStats.whip;

      // Full-lineup display stats (xOBP/xSLG) for both teams' starters and
      // the opposite-half no-run probability used to derive full-inning. We
      // compute these on the same recompute trigger so they share the same
      // park/weather/defense snapshot, and reuse the (12h Redis) splits cache
      // for any batter who's already been loaded today.
      const awayStarterIds = starterIdsOf(lastLineups?.away ?? null);
      const homeStarterIds = starterIdsOf(lastLineups?.home ?? null);
      const [awayBundle, homeBundle] = await Promise.all([
        bothPitchers.homePitcherId !== null && awayStarterIds
          ? loadLineupSplitsStep({
              gamePk: input.gamePk,
              pitcherId: bothPitchers.homePitcherId,
              batterIds: awayStarterIds,
            })
          : Promise.resolve(null),
        bothPitchers.awayPitcherId !== null && homeStarterIds
          ? loadLineupSplitsStep({
              gamePk: input.gamePk,
              pitcherId: bothPitchers.awayPitcherId,
              batterIds: homeStarterIds,
            })
          : Promise.resolve(null),
      ]);

      const awayStats: Record<string, LineupBatterStat> = awayBundle
        ? await computeLineupStatsStep({
            gamePk: input.gamePk,
            pitcher: awayBundle.pitcher,
            batters: awayBundle.batters,
            park: park.components,
            weather: weather.components,
            // Pass the live alignment only when away is currently batting —
            // otherwise the catcher/fielder ids reflect the wrong defense.
            oaaTable: half === "Top" ? defense.oaaTable : undefined,
            framingTable: half === "Top" ? defense.framingTable : undefined,
            catcherId: half === "Top" ? alignment.catcherId : null,
            fielderIds: half === "Top" ? alignment.fielderIds : [],
          })
        : {};
      const homeStats: Record<string, LineupBatterStat> = homeBundle
        ? await computeLineupStatsStep({
            gamePk: input.gamePk,
            pitcher: homeBundle.pitcher,
            batters: homeBundle.batters,
            park: park.components,
            weather: weather.components,
            oaaTable: half === "Bottom" ? defense.oaaTable : undefined,
            framingTable: half === "Bottom" ? defense.framingTable : undefined,
            catcherId: half === "Bottom" ? alignment.catcherId : null,
            fielderIds: half === "Bottom" ? alignment.fielderIds : [],
          })
        : {};
      lastLineupStats = { away: awayStats, home: homeStats };

      // Full-inning composition. When in Top, full = (rest of top) × (clean
      // bottom); home batters from {0 outs, empty bases} vs away pitcher.
      // When in Bottom, top is over → full equals the half value.
      if (half === "Top" && homeBundle) {
        const oppHalf = await computeNrXiStep({
          gamePk: input.gamePk,
          pitcher: homeBundle.pitcher,
          batters: homeBundle.batters,
          park: park.components,
          weather: weather.components,
          startState: { outs: 0, bases: 0 },
          paInGameForPitcher: 0,
          oaaTable: defense.oaaTable,
          framingTable: defense.framingTable,
          // Opposite half's defense isn't on the field; degrade gracefully.
          catcherId: null,
          fielderIds: [],
        });
        const pNoFull = lastNrXi.pNoHitEvent * oppHalf.pNoHitEvent;
        const pHitFull = 1 - pNoFull;
        lastFullInning = {
          pHit: pHitFull,
          pNo: pNoFull,
          breakEven: roundOdds(americanBreakEven(pNoFull)),
        };
      } else if (half === "Bottom") {
        lastFullInning = {
          pHit: lastNrXi.pHitEvent,
          pNo: lastNrXi.pNoHitEvent,
          breakEven: lastNrXi.breakEvenAmerican,
        };
      } else {
        lastFullInning = null;
      }

      lastInningKey = inningKey;
      lastLineupHash = lh;
      lastDefenseKey = dk;
      lastOppPitcherHash = op;
    }

    const nrXi = lastNrXi;
    const env = lastEnv;

    const decision = isDecisionMoment({ status, inning, half, outs, inningState });

    const state: GameState = {
      gamePk: input.gamePk,
      status,
      detailedState: tick.feed.gameData.status.detailedState ?? "",
      inning,
      half,
      outs,
      isDecisionMoment: decision,
      away: {
        id: tick.feed.gameData.teams.away.id,
        name: tick.feed.gameData.teams.away.name,
        runs: ls.teams?.away.runs ?? 0,
      },
      home: {
        id: tick.feed.gameData.teams.home.id,
        name: tick.feed.gameData.teams.home.name,
        runs: ls.teams?.home.runs ?? 0,
      },
      venue: tick.feed.gameData.venue
        ? { id: tick.feed.gameData.venue.id, name: tick.feed.gameData.venue.name }
        : null,
      pitcher:
        lastPitcherId !== null
          ? {
              id: lastPitcherId,
              name: lastPitcherName,
              throws: lastPitcherThrows,
              era: lastPitcherEra,
              whip: lastPitcherWhip,
            }
          : null,
      upcomingBatters: nrXi?.perBatter ?? [],
      pHitEvent: nrXi?.pHitEvent ?? null,
      pNoHitEvent: nrXi?.pNoHitEvent ?? null,
      breakEvenAmerican: nrXi?.breakEvenAmerican ?? null,
      pHitEventFullInning: lastFullInning?.pHit ?? null,
      pNoHitEventFullInning: lastFullInning?.pNo ?? null,
      breakEvenAmericanFullInning: lastFullInning?.breakEven ?? null,
      env,
      lineups: lastLineups ?? extractLineups(tick.feed),
      lineupStats: lastLineupStats,
      linescore: extractLinescore(tick.feed),
      ...extractBatterFocus(tick.feed),
      updatedAt: new Date().toISOString(),
    };

    await publishUpdateStep(state);

    if (status === "Final") {
      console.log("[watcher] final, exit", input.gamePk);
      return { reason: "final" };
    }

    let waitSec = 30;
    if (status === "Live") waitSec = tick.recommendedWaitSeconds;
    else if (status === "Pre") waitSec = 30;
    else if (status === "Delayed" || status === "Suspended") waitSec = 300;

    await refreshWatcherLockStep({
      gamePk: input.gamePk,
      ownerId: input.ownerId,
      ttlSeconds: 90,
    });
    await sleep(`${waitSec}s`);
  }

  console.log("[watcher] max loops reached", input.gamePk);
  return { reason: "max-loops" };
}
