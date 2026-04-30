"use client";

export function ProbabilityPill({
  pNoHitEvent,
  breakEvenAmerican,
}: {
  pNoHitEvent: number | null;
  breakEvenAmerican: number | null;
}) {
  if (pNoHitEvent === null || breakEvenAmerican === null) {
    return (
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
        <span>NRSI</span>
        <span>—</span>
      </div>
    );
  }
  const pct = (pNoHitEvent * 100).toFixed(1);
  const odds =
    breakEvenAmerican > 0 ? `+${Math.round(breakEvenAmerican)}` : String(Math.round(breakEvenAmerican));
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">P(NRSI)</div>
        <div className="font-mono text-xl tabular-nums">{pct}%</div>
      </div>
      <div className="text-right">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Min +EV</div>
        <div className="font-mono text-xl tabular-nums text-[var(--color-accent)]">{odds}</div>
      </div>
    </div>
  );
}
