import { k } from "../cache/keys";
import type { GameState } from "../state/game-state";

/**
 * Long-poll Upstash for new updates. Upstash REST doesn't support raw pub/sub
 * subscribe, so we use a Redis stream-style fan-out:
 *   - publishGameState writes to the snapshot hash
 *   - this subscriber polls the snapshot hash and emits diffs
 *
 * For low-latency push we'd swap to Upstash WebSocket pub/sub or a TCP client.
 */
export async function* iterateSnapshotChanges(
  redisClient: import("@upstash/redis").Redis,
  intervalMs = 2000,
  abort: AbortSignal,
): AsyncIterable<GameState> {
  let lastSeen = new Map<number, string>();
  while (!abort.aborted) {
    const all = await redisClient.hgetall<Record<string, string>>(k.snapshot());
    if (all) {
      for (const [pk, json] of Object.entries(all)) {
        if (lastSeen.get(Number(pk)) === json) continue;
        lastSeen.set(Number(pk), json);
        try {
          yield JSON.parse(json) as GameState;
        } catch {
          // skip malformed
        }
      }
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
