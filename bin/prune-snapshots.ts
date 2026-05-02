#!/usr/bin/env node
// One-shot snapshot reconciliation. Run this once to clean up zombie game
// entries left behind by a prior runtime that was mid-watching when it was
// paused or crashed (e.g. Vercel WDK pausing while games were Live, leaving
// `nrxi:snapshot` hash field-keys stuck on Live status forever because no
// further publish ever lands to flip them to Final).
//
// The supervisor calls the same logic on every cron firing — this script is
// just for the immediate one-time cleanup before the next cron fires.
//
// Usage:
//   npx tsx bin/prune-snapshots.ts                  # uses today (America/New_York)
//   npx tsx bin/prune-snapshots.ts --date 2026-05-02
//   npx tsx bin/prune-snapshots.ts --all            # nuke the whole hash (rare)

import "../services/lib/load-env";
import { pruneStaleSnapshots } from "../services/lib/prune-snapshots";
import { fetchSchedule } from "../lib/mlb/client";
import { redis } from "../lib/cache/redis";
import { k } from "../lib/cache/keys";
import { todayInTz } from "../lib/utils";
import { log } from "../lib/log";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--all")) {
    log.warn("bin/prune-snapshots", "deleting-entire-hash");
    await redis().del(k.snapshot());
    log.info("bin/prune-snapshots", "done", { mode: "all" });
    return;
  }

  const date = arg("--date") ?? todayInTz("America/New_York");
  log.info("bin/prune-snapshots", "fetching-schedule", { date });
  const schedule = await fetchSchedule(date);
  const gamePks = schedule.dates.flatMap((d) => d.games).map((g) => g.gamePk);
  log.info("bin/prune-snapshots", "today's-games", { date, count: gamePks.length });

  const result = await pruneStaleSnapshots(gamePks);
  log.info("bin/prune-snapshots", "done", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
