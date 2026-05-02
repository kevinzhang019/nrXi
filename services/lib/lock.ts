import { redis } from "../../lib/cache/redis";
import { k } from "../../lib/cache/keys";
import { log } from "../../lib/log";
import { sleepMs, isAbortError } from "./sleep";

// Watcher lock TTL — lower than WDK's 90s for faster crash recovery on
// Railway. With a 30s TTL refreshed every 10s, a crashed pod's lock expires
// within 30s, after which a replacement watcher can acquire it.
export const LOCK_TTL_SECONDS = 30;
export const LOCK_REFRESH_INTERVAL_MS = 10_000;

export async function acquireWatcherLock(opts: {
  gamePk: number;
  ownerId: string;
}): Promise<boolean> {
  const r = redis();
  const key = k.watcherLock(opts.gamePk);
  const existing = await r.get<string>(key);
  if (existing && existing !== opts.ownerId) {
    log.warn("lock", "acquire:held-by-other", { gamePk: opts.gamePk, owner: existing });
    return false;
  }
  await r.set(key, opts.ownerId, { ex: LOCK_TTL_SECONDS });
  log.info("lock", "acquire:ok", { gamePk: opts.gamePk });
  return true;
}

export async function refreshWatcherLock(opts: {
  gamePk: number;
  ownerId: string;
}): Promise<void> {
  const r = redis();
  const key = k.watcherLock(opts.gamePk);
  await r.set(key, opts.ownerId, { ex: LOCK_TTL_SECONDS });
}

// Background refresher — keeps the lock alive while the watcher loop runs.
// Returns a function that stops the refresher. Errors during refresh are
// logged but do not crash the watcher; if Redis is genuinely unreachable
// the next acquire from another process will eventually take over.
export function startLockRefresher(opts: {
  gamePk: number;
  ownerId: string;
  signal: AbortSignal;
}): () => void {
  let stopped = false;

  const loop = (async () => {
    while (!stopped && !opts.signal.aborted) {
      try {
        await sleepMs(LOCK_REFRESH_INTERVAL_MS, opts.signal);
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
      if (stopped || opts.signal.aborted) return;
      try {
        await refreshWatcherLock({ gamePk: opts.gamePk, ownerId: opts.ownerId });
      } catch (err) {
        log.error("lock", "refresh:fail", { gamePk: opts.gamePk, err: String(err) });
      }
    }
  })();

  void loop;

  return () => {
    stopped = true;
  };
}
