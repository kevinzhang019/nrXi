import { redis } from "@/lib/cache/redis";
import { k } from "@/lib/cache/keys";
import { log } from "@/lib/log";

export async function acquireWatcherLockStep(opts: {
  gamePk: number;
  ownerId: string;
  ttlSeconds: number;
}): Promise<boolean> {
  "use step";
  log.info("step", "acquireWatcherLock:start", { gamePk: opts.gamePk, ownerId: opts.ownerId });
  const r = redis();
  const key = k.watcherLock(opts.gamePk);
  const existing = await r.get<string>(key);
  if (existing && existing !== opts.ownerId) {
    log.warn("step", "acquireWatcherLock:held-by-other", { gamePk: opts.gamePk, owner: existing });
    return false;
  }
  await r.set(key, opts.ownerId, { ex: opts.ttlSeconds });
  log.info("step", "acquireWatcherLock:ok", { gamePk: opts.gamePk });
  return true;
}

export async function refreshWatcherLockStep(opts: {
  gamePk: number;
  ownerId: string;
  ttlSeconds: number;
}): Promise<void> {
  "use step";
  log.info("step", "refreshWatcherLock", { gamePk: opts.gamePk });
  const r = redis();
  const key = k.watcherLock(opts.gamePk);
  await r.set(key, opts.ownerId, { ex: opts.ttlSeconds });
}
