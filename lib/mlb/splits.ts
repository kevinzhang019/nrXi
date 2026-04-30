import { fetchPerson, fetchSplits } from "./client";
import { cacheJson } from "../cache/redis";
import { k } from "../cache/keys";
import type { HandCode, PitchHand } from "./types";

const SEASON = new Date().getUTCFullYear();
const FALLBACK_SEASON = SEASON - 1;

function num(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export type BatterProfile = {
  id: number;
  fullName: string;
  bats: HandCode;
  obpVs: { L: number; R: number };
};

export type PitcherProfile = {
  id: number;
  fullName: string;
  throws: PitchHand;
  whipVs: { L: number; R: number };
  obpVs: { L: number; R: number };
};

const DEFAULT_OBP = 0.32;
const DEFAULT_WHIP = 1.3;

async function loadHand(playerId: number) {
  return cacheJson(k.hand(playerId), 60 * 60 * 24 * 30, async () => {
    const r = await fetchPerson(playerId);
    const p = r.people[0];
    return {
      id: p.id,
      fullName: p.fullName,
      bats: p.batSide?.code ?? ("R" as HandCode),
      throws: p.pitchHand?.code ?? ("R" as PitchHand),
    };
  });
}

async function loadHittingSplitsRaw(playerId: number, season: number) {
  return cacheJson(`bat:splitsraw:${playerId}:${season}`, 60 * 60 * 12, async () => {
    return await fetchSplits({ playerId, group: "hitting", season });
  });
}

async function loadPitchingSplitsRaw(playerId: number, season: number) {
  return cacheJson(`pit:splitsraw:${playerId}:${season}`, 60 * 60 * 12, async () => {
    return await fetchSplits({ playerId, group: "pitching", season });
  });
}

function pickSplit(
  splits: Array<{ split: { code: string }; stat: Record<string, unknown> }>,
  code: "vl" | "vr",
): Record<string, unknown> | null {
  return (splits.find((s) => s.split.code === code)?.stat as Record<string, unknown>) ?? null;
}

export async function loadBatterProfile(playerId: number): Promise<BatterProfile> {
  const hand = await loadHand(playerId);
  let raw = await loadHittingSplitsRaw(playerId, SEASON);
  let splits = raw.stats[0]?.splits ?? [];
  if (splits.length === 0) {
    raw = await loadHittingSplitsRaw(playerId, FALLBACK_SEASON);
    splits = raw.stats[0]?.splits ?? [];
  }
  const vL = pickSplit(splits, "vl");
  const vR = pickSplit(splits, "vr");
  return {
    id: hand.id,
    fullName: hand.fullName,
    bats: hand.bats,
    obpVs: {
      L: num(vL?.obp) ?? DEFAULT_OBP,
      R: num(vR?.obp) ?? DEFAULT_OBP,
    },
  };
}

export async function loadPitcherProfile(playerId: number): Promise<PitcherProfile> {
  const hand = await loadHand(playerId);
  let raw = await loadPitchingSplitsRaw(playerId, SEASON);
  let splits = raw.stats[0]?.splits ?? [];
  if (splits.length === 0) {
    raw = await loadPitchingSplitsRaw(playerId, FALLBACK_SEASON);
    splits = raw.stats[0]?.splits ?? [];
  }
  const vL = pickSplit(splits, "vl");
  const vR = pickSplit(splits, "vr");
  return {
    id: hand.id,
    fullName: hand.fullName,
    throws: hand.throws as PitchHand,
    whipVs: {
      L: num(vL?.whip) ?? DEFAULT_WHIP,
      R: num(vR?.whip) ?? DEFAULT_WHIP,
    },
    obpVs: {
      L: num(vL?.obp) ?? DEFAULT_OBP,
      R: num(vR?.obp) ?? DEFAULT_OBP,
    },
  };
}
