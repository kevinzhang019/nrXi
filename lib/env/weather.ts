import { cacheJson } from "../cache/redis";
import { k } from "../cache/keys";
import { clamp } from "../utils";
import { log } from "../log";

const COVERS_URL = "https://contests.covers.com/weather/MLB";
const UA = process.env.MLB_USER_AGENT || "nrsi-app/0.1";

export type WeatherInfo = {
  tempF: number | null;
  windMph: number | null;
  windDir: "out" | "in" | "cross" | "calm" | null;
  precipPct: number | null;
  isDome: boolean;
  source: "covers" | "fallback";
};

const DEFAULT: WeatherInfo = {
  tempF: null,
  windMph: null,
  windDir: null,
  precipPct: null,
  isDome: false,
  source: "fallback",
};

function classifyWindDir(text: string): WeatherInfo["windDir"] {
  const t = text.toLowerCase();
  if (t.includes("out to") || /^out\b/.test(t)) return "out";
  if (t.includes("in from") || /^in\b/.test(t)) return "in";
  if (t.includes("calm") || t.includes("0 mph")) return "calm";
  if (t.includes("cross") || t.includes("l to r") || t.includes("r to l")) return "cross";
  return null;
}

async function scrapeCovers(awayTeam: string, homeTeam: string): Promise<WeatherInfo> {
  const res = await fetch(COVERS_URL, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`covers.com HTTP ${res.status}`);
  const html = await res.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  const wanted = `${awayTeam.toLowerCase()}${homeTeam.toLowerCase()}`;
  let found: WeatherInfo | null = null;
  $("table tr, .matchup, .game-row, .weather-row").each((_, el) => {
    if (found) return;
    const text = $(el).text().toLowerCase().replace(/\s+/g, " ");
    if (
      text.includes(awayTeam.toLowerCase()) &&
      text.includes(homeTeam.toLowerCase()) &&
      text.length < 800
    ) {
      const tempM = text.match(/(-?\d{1,3})\s*°?\s*f/);
      const windM = text.match(/(\d{1,2})\s*mph\s*([a-z ]+)?/);
      const precipM = text.match(/(\d{1,3})\s*%/);
      const dome = /dome|roof closed|indoor/.test(text);
      found = {
        tempF: tempM ? parseInt(tempM[1], 10) : null,
        windMph: windM ? parseInt(windM[1], 10) : null,
        windDir: windM ? classifyWindDir(windM[2] || "") : null,
        precipPct: precipM ? parseInt(precipM[1], 10) : null,
        isDome: dome,
        source: "covers",
      };
    }
    void wanted;
  });
  return found ?? DEFAULT;
}

export async function loadWeather(
  gamePk: number,
  awayTeam: string,
  homeTeam: string,
): Promise<WeatherInfo> {
  return cacheJson(k.weather(gamePk), 60 * 30, async () => {
    try {
      return await scrapeCovers(awayTeam, homeTeam);
    } catch (e) {
      log.warn("weather", "scrape:failed", { gamePk, err: String(e) });
      return DEFAULT;
    }
  });
}

export function weatherRunFactor(w: WeatherInfo): number {
  if (w.isDome) return 1.0;
  let f = 1.0;
  if (w.tempF !== null) f *= 1 + clamp((w.tempF - 70) * 0.004, -0.10, 0.10);
  if (w.windMph !== null && w.windDir === "out") f *= 1 + clamp(w.windMph * 0.005, 0, 0.08);
  if (w.windMph !== null && w.windDir === "in") f *= 1 - clamp(w.windMph * 0.005, 0, 0.08);
  if (w.precipPct !== null && w.precipPct > 60) f *= 0.95;
  return clamp(f, 0.85, 1.15);
}
