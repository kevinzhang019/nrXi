import { ScheduleResponse, PersonResponse, SplitsResponse, type LiveFeed } from "./types";
import { log } from "../log";

const STATSAPI = "https://statsapi.mlb.com";
const UA = process.env.MLB_USER_AGENT || "nrxi-app/0.1";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    log.warn("mlb", "fetch:non-ok", { url, status: res.status });
    throw new Error(`MLB fetch ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchSchedule(date: string) {
  const url = `${STATSAPI}/api/v1/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher,linescore,venue`;
  const raw = await fetchJson<unknown>(url);
  return ScheduleResponse.parse(raw);
}

export async function fetchLiveFull(gamePk: number): Promise<LiveFeed> {
  const url = `${STATSAPI}/api/v1.1/game/${gamePk}/feed/live`;
  return await fetchJson<LiveFeed>(url);
}

export async function fetchLiveDiff(
  gamePk: number,
  startTimecode: string,
): Promise<{ patches: unknown[]; full?: LiveFeed }> {
  const url = `${STATSAPI}/api/v1.1/game/${gamePk}/feed/live/diffPatch?startTimecode=${startTimecode}`;
  const raw = await fetchJson<unknown>(url);
  if (Array.isArray(raw)) return { patches: raw };
  if (raw && typeof raw === "object" && "metaData" in raw) {
    return { patches: [], full: raw as LiveFeed };
  }
  return { patches: [] };
}

export async function fetchPerson(playerId: number) {
  const url = `${STATSAPI}/api/v1/people/${playerId}`;
  const raw = await fetchJson<unknown>(url);
  return PersonResponse.parse(raw);
}

export async function fetchSplits(opts: {
  playerId: number;
  group: "hitting" | "pitching";
  season: number;
}) {
  const { playerId, group, season } = opts;
  const url = `${STATSAPI}/api/v1/people/${playerId}/stats?stats=statSplits&group=${group}&season=${season}&sitCodes=vl,vr`;
  const raw = await fetchJson<unknown>(url);
  return SplitsResponse.parse(raw);
}

export async function fetchVenue(venueId: number) {
  const url = `${STATSAPI}/api/v1/venues/${venueId}`;
  return await fetchJson<{ venues: Array<{ id: number; name: string; location?: { city?: string; state?: string } }> }>(url);
}
