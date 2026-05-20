import { fetchLiveDiff, fetchLiveFull } from "../../lib/mlb/client";
import type { LiveFeed } from "../../lib/mlb/types";
import { log } from "../../lib/log";

export type WatcherTick = {
  feed: LiveFeed;
  newTimecode: string;
  recommendedWaitSeconds: number;
};

/**
 * Live-cadence tick interval. Flat 2s regardless of inning state.
 *
 * Active PAs: outs / hits / walks can land at any moment; 2s is the floor
 * below which MLB's own ~1–3s event-to-feed ingest lag dominates.
 *
 * Inning breaks: pitching changes and lineup edits are surfaced by the
 * structural-key change detector, which only triggers a heavy reload when
 * the key actually changes. Polling faster during breaks doesn't load the
 * feed any harder — diffPatch responses are near-empty when nothing has
 * moved — and it shaves up to ~13s off the latency at the moment MLB
 * flips to the next half-inning.
 *
 * Cost: ~7.5 req/s worst-case across 15 concurrent games, comfortably under
 * MLB's anecdotal ~50 req/s soft limit. Railway Active CPU busy fraction is
 * dominated by the recompute step (~50–200ms when structural-key changes);
 * idle ticks are mostly network wait. We ignore MLB's `metaData.wait` hint
 * — community wrappers do the same on live ticks and our payload (2–20 KB
 * diff) is far below the level the hint is calibrated for.
 *
 * Exported for unit tests.
 */
export function chooseRecommendedWaitSeconds(_feed: LiveFeed): number {
  return 2;
}

/**
 * Apply RFC 6902-ish JSON Patch ops to a doc. Tolerant — ignores unknown ops.
 */
function applyPatch(doc: unknown, patches: unknown[]): unknown {
  let cur: any = JSON.parse(JSON.stringify(doc));
  for (const p of patches as Array<{
    op: string;
    path: string;
    value?: unknown;
  }>) {
    if (!p || typeof p.path !== "string") continue;
    const segs = p.path.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (segs.length === 0) {
      if (p.op === "replace" || p.op === "add") cur = p.value;
      continue;
    }
    let parent = cur;
    for (let i = 0; i < segs.length - 1; i++) {
      const key = isFinite(Number(segs[i])) && Array.isArray(parent) ? Number(segs[i]) : segs[i];
      if (parent[key] === undefined) parent[key] = isFinite(Number(segs[i + 1])) ? [] : {};
      parent = parent[key];
    }
    const last = segs[segs.length - 1];
    const key = Array.isArray(parent) && isFinite(Number(last)) ? Number(last) : last;
    if (p.op === "remove") {
      if (Array.isArray(parent)) parent.splice(key as number, 1);
      else delete (parent as Record<string, unknown>)[key as string];
    } else {
      (parent as Record<string | number, unknown>)[key as string | number] = p.value;
    }
  }
  return cur;
}

export async function fetchLiveDiffStep(opts: {
  gamePk: number;
  startTimecode: string | null;
  prevDoc: LiveFeed | null;
}): Promise<WatcherTick> {
  const { gamePk, startTimecode, prevDoc } = opts;
  log.info("step", "fetchLiveDiff:start", { gamePk, startTimecode });

  let feed: LiveFeed;
  if (!startTimecode || !prevDoc) {
    feed = await fetchLiveFull(gamePk);
  } else {
    const r = await fetchLiveDiff(gamePk, startTimecode);
    if (r.full) {
      feed = r.full;
    } else if (r.patches.length > 0) {
      feed = applyPatch(prevDoc, r.patches) as LiveFeed;
    } else {
      feed = prevDoc;
    }
  }

  const newTimecode = feed.metaData?.timeStamp ?? startTimecode ?? "";
  const recommendedWaitSeconds = chooseRecommendedWaitSeconds(feed);
  log.info("step", "fetchLiveDiff:ok", { gamePk, newTimecode, recommendedWaitSeconds });
  return { feed, newTimecode, recommendedWaitSeconds };
}
