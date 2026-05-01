"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameState } from "@/lib/state/game-state";
import { LineupColumn, type BatterStats } from "@/components/lineup-column";
import { cn } from "@/lib/utils";

type Side = "away" | "home";

function teamShort(name: string): string {
  const parts = name.split(" ");
  if (parts.length === 1) return name.slice(0, 3).toUpperCase();
  const last = parts[parts.length - 1];
  if (["Sox", "Jays", "Rays"].includes(last)) return parts.slice(-2).join(" ");
  return last;
}

export function LineupSinglePane({
  game,
  upcomingStatsById,
  awayHighlightId,
  awayHighlightKind,
  homeHighlightId,
  homeHighlightKind,
}: {
  game: GameState;
  // Stats for the upcoming half-inning (already on the published state). Used
  // as a fallback when full-lineup stats haven't been computed yet, so the
  // upcoming batters at least show numbers in early ticks.
  upcomingStatsById: Map<number, BatterStats>;
  awayHighlightId: number | null;
  awayHighlightKind: "current" | "next" | null;
  homeHighlightId: number | null;
  homeHighlightKind: "current" | "next" | null;
}) {
  // Track the manually-selected side and the most recently observed batting
  // side. When game.battingTeam changes (half-inning flip, including null →
  // away on first pitch), we clear any manual override and re-snap to the new
  // at-bat team. This matches the spec: "automatically switch panes whenever
  // half inning is triggered."
  const [manualOverride, setManualOverride] = useState<Side | null>(null);
  const [lastBattingSide, setLastBattingSide] = useState<Side | null>(
    game.battingTeam,
  );

  useEffect(() => {
    if (game.battingTeam !== lastBattingSide) {
      setManualOverride(null);
      setLastBattingSide(game.battingTeam);
    }
  }, [game.battingTeam, lastBattingSide]);

  const selectedSide: Side =
    manualOverride ?? game.battingTeam ?? "away";

  const statsById = useMemo(() => {
    const m = new Map<number, BatterStats>();
    const fromState = game.lineupStats?.[selectedSide];
    if (fromState) {
      for (const [id, s] of Object.entries(fromState)) {
        const n = Number(id);
        if (Number.isFinite(n)) m.set(n, s);
      }
    }
    // Merge the upcoming-batter stats on top so any in-play subs (not in the
    // starter set) still show numbers when they're due up.
    if (selectedSide === game.battingTeam) {
      for (const [id, s] of upcomingStatsById) {
        if (!m.has(id)) m.set(id, s);
      }
    }
    return m;
  }, [game.lineupStats, selectedSide, game.battingTeam, upcomingStatsById]);

  const lineup = game.lineups?.[selectedSide] ?? null;
  const highlightId =
    selectedSide === "away" ? awayHighlightId : homeHighlightId;
  const highlightKind =
    selectedSide === "away" ? awayHighlightKind : homeHighlightKind;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-6 text-[12px] uppercase tracking-[0.18em]">
        {(["away", "home"] as Side[]).map((side) => {
          const name =
            side === "away" ? game.away.name : game.home.name;
          const isSelected = side === selectedSide;
          return (
            <button
              key={side}
              type="button"
              onClick={() => setManualOverride(side)}
              className={cn(
                "transition-colors",
                isSelected
                  ? "text-[var(--color-fg)] font-medium"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]/85",
              )}
            >
              {teamShort(name)}
            </button>
          );
        })}
      </div>
      <LineupColumn
        label=""
        lineup={lineup}
        highlightId={highlightId}
        highlightKind={highlightKind}
        statsById={statsById}
      />
    </div>
  );
}
