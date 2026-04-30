export function americanBreakEven(q: number): number {
  if (q <= 0 || q >= 1) return q <= 0 ? Infinity : -Infinity;
  if (q >= 0.5) return -100 * (q / (1 - q));
  return 100 * ((1 - q) / q);
}

export function impliedProb(american: number): number {
  if (american === 0) return 0.5;
  if (american < 0) return -american / (-american + 100);
  return 100 / (american + 100);
}

export function roundOdds(american: number): number {
  if (!Number.isFinite(american)) return american;
  const sign = american >= 0 ? 1 : -1;
  return sign * Math.round(Math.abs(american) / 5) * 5;
}
