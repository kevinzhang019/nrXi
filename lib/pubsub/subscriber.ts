import { k } from "../cache/keys";
import { redisRestConfig } from "../cache/redis";
import type { GameState } from "../state/game-state";

/**
 * Push-based subscription via Upstash Redis REST `/subscribe/{channel}` SSE
 * endpoint. The watcher already calls `r.publish(channel, json)` on every tick;
 * this opens a long-lived HTTP fetch and yields each `message,...` line as a
 * parsed `GameState`.
 *
 * Wire format (per Upstash REST docs):
 *   data: subscribe,<channel>,<count>     -> subscription confirmation, ignored
 *   data: message,<channel>,<json>        -> payload event
 */
export async function* subscribeToChannel(
  channel: string,
  abort: AbortSignal,
): AsyncIterable<GameState> {
  const { url, token } = redisRestConfig();
  const res = await fetch(`${url}/subscribe/${encodeURIComponent(channel)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    signal: abort,
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `Upstash subscribe failed: ${res.status} ${res.statusText}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!abort.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        const state = parseSubscribeLine(line);
        if (state) yield state;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/**
 * Parse one line of the Upstash `/subscribe` SSE wire format. Returns the
 * parsed `GameState` for `message` events, or `null` for everything else
 * (subscribe confirmations, comments, blank lines, malformed payloads).
 *
 * Exported for unit testing.
 */
export function parseSubscribeLine(line: string): GameState | null {
  if (!line.startsWith("data:")) return null;
  const body = line.slice("data:".length).trim();
  if (!body.startsWith("message,")) return null;
  const firstComma = body.indexOf(",");
  const secondComma = body.indexOf(",", firstComma + 1);
  if (secondComma < 0) return null;
  const payload = body.slice(secondComma + 1);
  try {
    return JSON.parse(payload) as GameState;
  } catch {
    return null;
  }
}

export const PUBSUB_CHANNEL = k.pubsubChannel();

/**
 * Fallback: long-poll Upstash for new updates by hashing the snapshot. Kept
 * for back-compat in case the SSE subscribe endpoint hiccups; not currently
 * wired in the route handler.
 */
export async function* iterateSnapshotChanges(
  redisClient: import("@upstash/redis").Redis,
  intervalMs = 2000,
  abort: AbortSignal,
): AsyncIterable<GameState> {
  const lastSeen = new Map<number, string>();
  while (!abort.aborted) {
    const all = await redisClient.hgetall<Record<string, unknown>>(k.snapshot());
    if (all) {
      for (const [pk, raw] of Object.entries(all)) {
        let state: GameState | null = null;
        let signature = "";
        if (raw && typeof raw === "object") {
          state = raw as GameState;
          signature = JSON.stringify(raw);
        } else if (typeof raw === "string") {
          signature = raw;
          try {
            state = JSON.parse(raw) as GameState;
          } catch {
            state = null;
          }
        }
        if (!state) continue;
        if (lastSeen.get(Number(pk)) === signature) continue;
        lastSeen.set(Number(pk), signature);
        yield state;
      }
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
