import { redis } from "../cache/redis";
import { k } from "../cache/keys";
import type { GameState } from "../state/game-state";

export async function publishGameState(state: GameState) {
  const r = redis();
  await Promise.all([
    r.publish(k.pubsubChannel(), JSON.stringify(state)),
    r.hset(k.snapshot(), { [String(state.gamePk)]: JSON.stringify(state) }),
    r.expire(k.snapshot(), 60 * 60 * 24),
  ]);
}

export async function getSnapshot(): Promise<GameState[]> {
  const r = redis();
  const all = await r.hgetall<Record<string, string>>(k.snapshot());
  if (!all) return [];
  return Object.values(all)
    .map((v) => {
      try {
        return JSON.parse(v) as GameState;
      } catch {
        return null;
      }
    })
    .filter((x): x is GameState => x !== null);
}
