"use client";

import { useCallback, useMemo, useState } from "react";
import { GameCard } from "@/components/game-card";
import { HistoricalPlaysPanel } from "@/components/historical-plays-panel";
import type { GameState } from "@/lib/state/game-state";
import type { HistoricalGame, HistoricalInning, PlayRow } from "@/lib/types/history";
import {
  buildAvailability,
  buildFrozenState,
  buildFullInningFrozenState,
  defaultInningSelection,
  type InningSelection,
} from "@/components/historical-game-view-helpers";

export function HistoricalGameView({
  game,
  innings,
  plays,
}: {
  game: HistoricalGame;
  innings: HistoricalInning[];
  plays: PlayRow[];
}) {
  const innByKey = useMemo(() => {
    const m = new Map<string, HistoricalInning>();
    for (const i of innings) m.set(`${i.inning}-${i.half}`, i);
    return m;
  }, [innings]);

  const maxInning = useMemo(() => {
    let n = 9;
    for (const i of innings) if (i.inning > n) n = i.inning;
    if (game.linescore) {
      for (const inn of game.linescore.innings) if (inn.num > n) n = inn.num;
    }
    return n;
  }, [innings, game.linescore]);

  const availability = useMemo(() => buildAvailability(innByKey), [innByKey]);

  const [selection, setSelection] = useState<InningSelection>(() =>
    defaultInningSelection(innByKey, maxInning),
  );

  const onSelectInning = useCallback(
    (n: number) => {
      // Click on the inning *number* → full-inning view if both halves are
      // captured; otherwise gracefully fall back to whichever half exists.
      if (innByKey.has(`${n}-Top`) && innByKey.has(`${n}-Bottom`)) {
        setSelection({ kind: "full", inning: n });
      } else if (innByKey.has(`${n}-Top`)) {
        setSelection({ kind: "half", inning: n, half: "Top" });
      } else if (innByKey.has(`${n}-Bottom`)) {
        setSelection({ kind: "half", inning: n, half: "Bottom" });
      }
    },
    [innByKey],
  );

  const onSelectHalf = useCallback(
    (n: number, half: "Top" | "Bottom") => {
      if (innByKey.has(`${n}-${half}`)) {
        setSelection({ kind: "half", inning: n, half });
      }
    },
    [innByKey],
  );

  // Batter ids that had a PA in the currently-selected inning/half. Top-half
  // plays attribute to the away lineup; Bottom-half plays to the home lineup.
  // Used by GameCard's lineup section to highlight rows of players who batted.
  const paBatterIds = useMemo(() => {
    const away = new Set<number>();
    const home = new Set<number>();
    for (const p of plays) {
      if (p.inning !== selection.inning) continue;
      if (selection.kind === "half" && p.half !== selection.half) continue;
      (p.half === "Top" ? away : home).add(p.batterId);
    }
    return { away, home };
  }, [plays, selection]);

  if (!game.finalSnapshot) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Final snapshot not stored for this game — older record predates the history feature.
      </p>
    );
  }

  let frozen: GameState;
  if (selection.kind === "full") {
    const top = innByKey.get(`${selection.inning}-Top`);
    const bottom = innByKey.get(`${selection.inning}-Bottom`);
    if (top && bottom) {
      frozen = buildFullInningFrozenState(game, top, bottom);
    } else {
      const fallback = top ?? bottom;
      frozen = fallback
        ? buildFrozenState(game, fallback)
        : (game.finalSnapshot as GameState);
    }
  } else {
    const inning = innByKey.get(`${selection.inning}-${selection.half}`);
    frozen = inning ? buildFrozenState(game, inning) : (game.finalSnapshot as GameState);
  }

  return (
    <div className="space-y-6">
      <GameCard
        game={frozen}
        historical
        wide
        selection={selection}
        inningAvailability={availability}
        onSelectInning={onSelectInning}
        onSelectHalf={onSelectHalf}
        paBatterIds={paBatterIds}
      />
      <HistoricalPlaysPanel plays={plays} selection={selection} />
    </div>
  );
}
