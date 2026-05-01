"use client";

export function ProbabilityPill({
  pNoHitEvent,
  breakEvenAmerican,
}: {
  pNoHitEvent: number | null | undefined;
  breakEvenAmerican: number | null | undefined;
}) {
  // Use == to catch both null and undefined. Stale Redis snapshot states
  // written before the *FullInning fields were added return undefined; the
  // pill should render "—" rather than NaN%.
  if (pNoHitEvent == null || breakEvenAmerican == null) {
    return (
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
        <span>nrXi</span>
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
        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">P(nrXi)</div>
        <div className="font-mono text-xl tabular-nums">{pct}%</div>
      </div>
      <div className="text-right">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Min +EV</div>
        <div className="font-mono text-xl tabular-nums text-[var(--color-accent)]">{odds}</div>
      </div>
    </div>
  );
}
