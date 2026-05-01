"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

export type PredictMode = "half" | "full";
export type ViewMode = "single" | "split";

export type Settings = {
  predictMode: PredictMode;
  viewMode: ViewMode;
};

// Defaults: full-inning + one team at a time — the left option of each
// segmented toggle in the gear popover. Users opt into half-inning / split.
const DEFAULTS: Settings = { predictMode: "full", viewMode: "single" };
const STORAGE_KEY = "nrxi:settings";

type Listener = () => void;
const listeners = new Set<Listener>();

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

// Cache the snapshot keyed by the raw storage string so getSnapshot returns
// the same reference between calls when storage hasn't changed. Without this,
// useSyncExternalStore would re-render every read because each call would
// produce a fresh object.
let cachedRaw: string | null | undefined;
let cachedSnapshot: Settings = DEFAULTS;

function getClientSnapshot(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = readStorage();
  return cachedSnapshot;
}

function getServerSnapshot(): Settings {
  return DEFAULTS;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Cross-tab updates: when another tab writes the key, invalidate cache and
  // notify React. Same-tab updates are pushed via notifyAll() in setSettings.
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cachedRaw = undefined;
      listener();
    }
  };
  window.addEventListener("storage", handler);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handler);
  };
}

function notifyAll() {
  cachedRaw = undefined;
  for (const l of listeners) l();
}

function writeSettings(partial: Partial<Settings>) {
  if (typeof window === "undefined") return;
  const current = readStorage();
  const next = { ...current, ...partial };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be disabled (private mode); preferences become session-only.
  }
  notifyAll();
}

type Ctx = {
  settings: Settings;
  setSettings: (partial: Partial<Settings>) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore guarantees the client uses getServerSnapshot during
  // hydration and only switches to the client snapshot AFTER hydration
  // commits. This avoids a streaming-Suspense race where the provider's
  // useEffect-setState fires before downstream children hydrate, producing a
  // hydration mismatch in <ProbabilityPill> / <LineupSinglePane> etc.
  const settings = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const setSettings = useCallback((partial: Partial<Settings>) => {
    writeSettings(partial);
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
