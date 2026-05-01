"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type PredictMode = "half" | "full";
export type ViewMode = "single" | "split";

export type Settings = {
  predictMode: PredictMode;
  viewMode: ViewMode;
};

// Defaults: full inning + one team at a time. Both new behaviors are the
// default per product direction; users opt out via the gear popover.
const DEFAULTS: Settings = { predictMode: "full", viewMode: "single" };
const STORAGE_KEY = "nrxi:settings";

type Ctx = {
  settings: Settings;
  setSettings: (partial: Partial<Settings>) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

function readStorage(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      predictMode: parsed.predictMode === "half" ? "half" : "full",
      viewMode: parsed.viewMode === "split" ? "split" : "single",
    };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // SSR-safe: render with defaults on the server, sync from localStorage on
  // first client effect. The provider sits below the existing <Suspense> so
  // hydration mismatch is benign — but we still defer reads to avoid warnings.
  const [settings, setState] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setState(readStorage());
  }, []);

  const setSettings = useCallback((partial: Partial<Settings>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage may be disabled (private mode); preferences become
          // session-only, which is acceptable.
        }
      }
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    // Fallback so a consumer rendered outside the provider doesn't crash —
    // returns a no-op setter and the defaults. In practice the provider
    // wraps the whole page in app/page.tsx.
    return {
      settings: DEFAULTS,
      setSettings: () => {},
    };
  }
  return ctx;
}
