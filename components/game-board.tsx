"use client";

import { useMemo } from "react";
import { useGameStream } from "@/lib/hooks/use-game-stream";
import { GameCard } from "@/components/game-card";
import type { GameState } from "@/lib/state/game-state";

const STATUS_ORDER: Record<string, number> = {
  Live: 0,
  Delayed: 1,
  Suspended: 2,
  Pre: 3,
  Final: 4,
  Other: 5,
};

function sortGames(a: GameState, b: GameState): number {
  if (a.isDecisionMoment !== b.isDecisionMoment) return a.isDecisionMoment ? -1 : 1;
  const oa = STATUS_ORDER[a.status] ?? 5;
  const ob = STATUS_ORDER[b.status] ?? 5;
  if (oa !== ob) return oa - ob;
  if (a.status === "Live" && b.status === "Live") return (b.inning ?? 0) - (a.inning ?? 0);
  return 0;
}

export function GameBoard({ initial }: { initial: GameState[] }) {
  const games = useGameStream(initial);
  const sorted = useMemo(() => [...games].sort(sortGames), [games]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          Waiting for the daily schedule. The poller will populate this board within a few seconds of game start.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sorted.map((g) => (
        <GameCard key={g.gamePk} game={g} />
      ))}
    </div>
  );
}
