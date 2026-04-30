import { describe, it, expect } from "vitest";
import { weatherRunFactor, type WeatherInfo } from "./weather";

const base: WeatherInfo = {
  tempF: null,
  windMph: null,
  windDir: null,
  precipPct: null,
  isDome: false,
  source: "covers",
};

describe("weatherRunFactor", () => {
  it("returns 1.0 for dome regardless of inputs", () => {
    expect(weatherRunFactor({ ...base, isDome: true, tempF: 100, windMph: 30, windDir: "out" })).toBe(1.0);
  });

  it("boosts on hot day with wind out", () => {
    const f = weatherRunFactor({ ...base, tempF: 90, windMph: 12, windDir: "out" });
    expect(f).toBeGreaterThan(1.05);
  });

  it("suppresses on cold with wind in", () => {
    const f = weatherRunFactor({ ...base, tempF: 50, windMph: 12, windDir: "in" });
    expect(f).toBeLessThan(0.95);
  });

  it("clamps in [0.85, 1.15]", () => {
    const high = weatherRunFactor({ ...base, tempF: 110, windMph: 30, windDir: "out" });
    const low = weatherRunFactor({ ...base, tempF: 20, windMph: 30, windDir: "in", precipPct: 90 });
    expect(high).toBeLessThanOrEqual(1.15);
    expect(low).toBeGreaterThanOrEqual(0.85);
  });
});
