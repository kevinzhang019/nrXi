import { loadWeather, weatherRunFactor, type WeatherInfo } from "@/lib/env/weather";
import { log } from "@/lib/log";

export async function loadWeatherStep(opts: {
  gamePk: number;
  awayTeam: string;
  homeTeam: string;
}): Promise<{ info: WeatherInfo; factor: number }> {
  "use step";
  const { gamePk, awayTeam, homeTeam } = opts;
  log.info("step", "loadWeather:start", { gamePk, awayTeam, homeTeam });
  const info = await loadWeather(gamePk, awayTeam, homeTeam);
  const factor = weatherRunFactor(info);
  log.info("step", "loadWeather:ok", { gamePk, factor });
  return { info, factor };
}
