"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useSettings,
  type PredictMode,
  type ViewMode,
} from "@/lib/hooks/use-settings";

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .35 1.86l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.86-.35 1.7 1.7 0 0 0-1.05 1.56V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.34a1.7 1.7 0 0 0-1.86.35l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .35-1.86 1.7 1.7 0 0 0-1.56-1.05H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.66 9a1.7 1.7 0 0 0-.35-1.86l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.86.35H9a1.7 1.7 0 0 0 1.05-1.56V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1.05 1.56 1.7 1.7 0 0 0 1.86-.35l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.35 1.86V9a1.7 1.7 0 0 0 1.56 1.05H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.05Z" />
    </svg>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded border border-[var(--color-border)] bg-[var(--color-subtle)]/60 p-1">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded px-2 py-1.5 text-[12px] transition-colors",
                selected
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]/85",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsButton() {
  const { settings, setSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors",
          open
            ? "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-accent)]"
            : "text-[var(--color-muted)] hover:text-[var(--color-accent)]",
        )}
      >
        <GearIcon className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-xl">
          <div className="space-y-4">
            <Segmented<PredictMode>
              label="Predict"
              value={settings.predictMode}
              onChange={(predictMode) => setSettings({ predictMode })}
              options={[
                { value: "full", label: "Full inning" },
                { value: "half", label: "Half-inning" },
              ]}
            />
            <Segmented<ViewMode>
              label="Lineups"
              value={settings.viewMode}
              onChange={(viewMode) => setSettings({ viewMode })}
              options={[
                { value: "single", label: "Selector" },
                { value: "split", label: "Both" },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
