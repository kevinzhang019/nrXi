import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InningCapture } from "@/lib/types/history";
import type { GameStubContext } from "./inning-predictions";

// Record every .from(table).upsert(row, opts) call so we can assert the
// prediction-row insert is first-write-wins (ignoreDuplicates: true). That
// option is a load-bearing invariant: a successor watcher re-firing the
// boundary capture after a restart must NOT overwrite the original
// first-of-the-half prediction. A plain upsert (last-write-wins) silently
// reintroduces the cross-watcher-overwrite corruption.
type UpsertCall = { table: string; row: unknown; opts: unknown };
const calls: UpsertCall[] = [];

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => true,
  supabaseAdmin: () => ({
    from(table: string) {
      return {
        upsert(row: unknown, opts: unknown) {
          calls.push({ table, row, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

// Imported after the mock is registered.
const { upsertInningPrediction } = await import("./inning-predictions");

const context: GameStubContext = {
  gamePk: 776655,
  gameDate: "2026-05-16",
  startTime: "2026-05-16T23:10:00Z",
  status: "Live",
  detailedState: "In Progress",
  away: { id: 111, name: "Away" },
  home: { id: 222, name: "Home" },
  venue: { id: 333, name: "Park" },
};

const capture: InningCapture = {
  inning: 2,
  half: "Bottom",
  pNoRun: 0.66,
  pRun: 0.34,
  breakEvenAmerican: -194,
  perBatter: [],
  pitcher: { active: null, away: null, home: null },
  env: null,
  lineupStats: null,
  defenseKey: "k",
  capturedAt: "2026-05-16T23:42:00Z",
};

describe("upsertInningPrediction", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the games stub then the prediction row", async () => {
    await upsertInningPrediction({ context, capture });
    expect(calls.map((c) => c.table)).toEqual(["games", "inning_predictions"]);
  });

  it("inserts the prediction row first-write-wins (ignoreDuplicates: true)", async () => {
    await upsertInningPrediction({ context, capture });
    const pred = calls.find((c) => c.table === "inning_predictions");
    expect(pred).toBeDefined();
    expect(pred!.opts).toEqual({
      onConflict: "game_pk,inning,half",
      ignoreDuplicates: true,
    });
  });

  it("keeps the games stub insert-on-conflict-do-nothing too", async () => {
    await upsertInningPrediction({ context, capture });
    const stub = calls.find((c) => c.table === "games");
    expect(stub!.opts).toEqual({
      onConflict: "game_pk",
      ignoreDuplicates: true,
    });
  });

  it("persists the capture's (inning, half) on the prediction row", async () => {
    await upsertInningPrediction({ context, capture });
    const pred = calls.find((c) => c.table === "inning_predictions");
    expect(pred!.row).toMatchObject({
      game_pk: 776655,
      inning: 2,
      half: "Bottom",
      p_no_run: 0.66,
      p_run: 0.34,
    });
  });
});
