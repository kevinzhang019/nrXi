#!/usr/bin/env node
// Local-dev script: run a single watcher against a known gamePk and exit.
// Used to smoke-test the Railway watcher path without booting the full
// supervisor + waiting for cron.
//
// Usage:
//   npx tsx bin/run-watcher-once.ts <gamePk> [--away "Team Name"] [--home "Team Name"]
// or via package.json: `npm run watch:once -- <gamePk>`.
//
// Team names default to placeholders that work for park/weather scrapers when
// the underlying lib falls through to alias maps; pass --away / --home if the
// scrapers need exact display names.

// MUST be the first import — loads .env.local for local-dev runs before any
// module reads process.env. Production (Railway) has no file and the loader
// no-ops.
import "../services/lib/load-env";
import { runWatcher } from "../services/run-watcher";
import { fetchSchedule } from "../lib/mlb/client";
import { todayInTz } from "../lib/utils";
import { log } from "../lib/log";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const gamePkArg = process.argv.find(
    (a, i) => i >= 2 && /^\d+$/.test(a) && process.argv[i - 1] !== "--away" && process.argv[i - 1] !== "--home",
  );
  if (!gamePkArg) {
    console.error("usage: run-watcher-once <gamePk> [--away \"Team\"] [--home \"Team\"]");
    process.exit(2);
  }
  const gamePk = Number(gamePkArg);

  let awayTeamName = arg("--away");
  let homeTeamName = arg("--home");

  // Fall back to today's schedule lookup so the script "just works" when the
  // user only knows the gamePk.
  if (!awayTeamName || !homeTeamName) {
    const date = arg("--date") ?? todayInTz("America/New_York");
    log.info("bin/run-watcher-once", "lookup-schedule", { date, gamePk });
    const schedule = await fetchSchedule(date);
    const game = schedule.dates.flatMap((d) => d.games).find((g) => g.gamePk === gamePk);
    if (!game) {
      console.error(`gamePk ${gamePk} not found in schedule for ${date}; pass --away/--home explicitly`);
      process.exit(2);
    }
    awayTeamName = awayTeamName ?? game.teams.away.team.name;
    homeTeamName = homeTeamName ?? game.teams.home.team.name;
  }

  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());
  process.on("SIGTERM", () => ac.abort());

  const ownerId = `watcher-once-${gamePk}-${Date.now()}`;
  const result = await runWatcher(
    { gamePk, ownerId, awayTeamName: awayTeamName!, homeTeamName: homeTeamName! },
    ac.signal,
  );
  log.info("bin/run-watcher-once", "exit", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
