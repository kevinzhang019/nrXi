import { cacheJson } from "../cache/redis";
import { k } from "../cache/keys";
import { log } from "../log";

const SAVANT_URL =
  "https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?type=year&year=";

const UA = process.env.MLB_USER_AGENT || "nrsi-app/0.1";

type ParkRow = { team: string; runsIndex: number };

async function scrapeParkFactors(season: number): Promise<ParkRow[]> {
  const url = `${SAVANT_URL}${season}&batSide=&stat=index_runs&condition=All&rolling=`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`Savant park factors HTTP ${res.status}`);
  const html = await res.text();
  const m =
    html.match(/<script[^>]*id="park-factors-data"[^>]*>([\s\S]*?)<\/script>/) ||
    html.match(/var\s+data\s*=\s*(\[\{[\s\S]*?\}\])\s*;/);
  if (m) {
    try {
      return parseSavantData(JSON.parse(m[1]));
    } catch {
      // fall through
    }
  }
  return regexParseTable(html);
}

function parseSavantData(data: unknown): ParkRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row): ParkRow | null => {
      const r = row as Record<string, unknown>;
      const team = (r.team_name || r.name || r.team) as string | undefined;
      const idx = (r.index_runs || r.runs_index || r.runs) as number | string | undefined;
      if (!team || idx === undefined) return null;
      const n = typeof idx === "number" ? idx : parseFloat(String(idx));
      if (!Number.isFinite(n)) return null;
      return { team: String(team), runsIndex: n > 5 ? n / 100 : n };
    })
    .filter((x): x is ParkRow => x !== null);
}

function regexParseTable(html: string): ParkRow[] {
  const rows: ParkRow[] = [];
  const re = /<tr[^>]*>[\s\S]*?<td[^>]*>([A-Z]{2,3})[\s\S]*?<td[^>]*>([0-9.]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const team = m[1];
    const v = parseFloat(m[2]);
    if (Number.isFinite(v)) rows.push({ team, runsIndex: v > 5 ? v / 100 : v });
  }
  return rows;
}

export async function loadParkFactors(season: number): Promise<ParkRow[]> {
  return cacheJson(k.parkFactors(season), 60 * 60 * 24, async () => {
    try {
      return await scrapeParkFactors(season);
    } catch (e) {
      log.warn("park", "scrape:failed", { season, err: String(e) });
      return [];
    }
  });
}

const TEAM_ABBR: Record<string, string> = {
  "arizona diamondbacks": "ARI",
  "atlanta braves": "ATL",
  "baltimore orioles": "BAL",
  "boston red sox": "BOS",
  "chicago cubs": "CHC",
  "chicago white sox": "CWS",
  "cincinnati reds": "CIN",
  "cleveland guardians": "CLE",
  "colorado rockies": "COL",
  "detroit tigers": "DET",
  "houston astros": "HOU",
  "kansas city royals": "KC",
  "los angeles angels": "LAA",
  "los angeles dodgers": "LAD",
  "miami marlins": "MIA",
  "milwaukee brewers": "MIL",
  "minnesota twins": "MIN",
  "new york mets": "NYM",
  "new york yankees": "NYY",
  "athletics": "OAK",
  "oakland athletics": "OAK",
  "philadelphia phillies": "PHI",
  "pittsburgh pirates": "PIT",
  "san diego padres": "SD",
  "san francisco giants": "SF",
  "seattle mariners": "SEA",
  "st. louis cardinals": "STL",
  "tampa bay rays": "TB",
  "texas rangers": "TEX",
  "toronto blue jays": "TOR",
  "washington nationals": "WSH",
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

export async function getParkRunFactor(homeTeamName: string, season: number): Promise<number> {
  const table = await loadParkFactors(season);
  if (table.length === 0) return 1.0;
  const norm = normalize(homeTeamName);
  const abbr = TEAM_ABBR[norm];
  const match =
    table.find((r) => r.team === abbr) ||
    table.find((r) => normalize(r.team) === norm) ||
    table.find((r) => norm.includes(normalize(r.team)) || normalize(r.team).includes(norm));
  if (!match) return 1.0;
  if (match.runsIndex < 0.5 || match.runsIndex > 1.6) return 1.0;
  return match.runsIndex;
}
