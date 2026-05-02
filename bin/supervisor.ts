#!/usr/bin/env node
// Railway cron entry point. Spawned daily by `0 12 * * *` cron in railway.toml.
// Boots the supervisor, which schedules per-game watchers to start ~90s before
// first pitch, then idles until all watchers finish AND we're past the
// next-day 06:00 UTC cutoff. Exits cleanly so Railway can scale the container
// to zero until the next cron firing.

// MUST be the first import — loads .env.local for local-dev runs before any
// module reads process.env. Production (Railway) has no file and the loader
// no-ops.
import "../services/lib/load-env";
import { runSupervisor } from "../services/supervisor";
import { log } from "../lib/log";

const ac = new AbortController();

let shuttingDown = false;
function handleSignal(sig: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn("bin/supervisor", "signal", { sig });
  ac.abort();
}

process.on("SIGTERM", () => handleSignal("SIGTERM"));
process.on("SIGINT", () => handleSignal("SIGINT"));

runSupervisor({ signal: ac.signal })
  .then((result) => {
    log.info("bin/supervisor", "exit", result);
    process.exit(0);
  })
  .catch((err) => {
    log.error("bin/supervisor", "fatal", { err: String(err), stack: err?.stack });
    process.exit(1);
  });
