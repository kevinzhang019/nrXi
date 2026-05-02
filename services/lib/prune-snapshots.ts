import { redis } from "../../lib/cache/redis";
import { k } from "../../lib/cache/keys";
import { log } from "../../lib/log";

// Remove any field-keys from `nrxi:snapshot` that aren't in today's schedule.
//
// Why this exists: `publishGameState` does HSET + `expire(24h)` on every tick,
// which means the hash's TTL never actually expires while any watcher is
// publishing today. Old games from prior days (especially ones the previous
// runtime was mid-watching when it crashed/was paused) can stay in the hash
// indefinitely, surfacing on the dashboard as zombie "Live" games.
//
// The supervisor calls this after seedSnapshot so each cron firing leaves the
// hash containing only the day's games. There's also a `bin/prune-snapshots.ts`
// one-shot for immediate cleanup outside a cron firing.
//
// Safety: we only touch the snapshot hash. Watcher locks
// (`nrxi:lock:{gamePk}`) and watcher-state keys carry their own TTLs and
// expire on their own.
export async function pruneStaleSnapshots(todaysGamePks: number[]): Promise<{
  total: number;
  kept: number;
  deleted: number;
}> {
  const r = redis();
  const keep = new Set(todaysGamePks.map((n) => String(n)));

  // Use HKEYS so we don't pull every game's full JSON payload over the wire.
  const fields = await r.hkeys(k.snapshot());
  const stale = fields.filter((f) => !keep.has(f));

  if (stale.length > 0) {
    await r.hdel(k.snapshot(), ...stale);
  }

  log.info("prune", "snapshots", {
    total: fields.length,
    kept: fields.length - stale.length,
    deleted: stale.length,
  });

  return { total: fields.length, kept: fields.length - stale.length, deleted: stale.length };
}
