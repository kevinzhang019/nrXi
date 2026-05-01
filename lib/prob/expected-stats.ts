import type { PaOutcomes } from "../mlb/splits";

/**
 * Expected SLG for a single PA, derived from the post-pipeline outcome multinomial.
 *
 * Total bases per AB:
 *   (1·1B + 2·2B + 3·3B + 4·HR) / (1 - BB - HBP)
 *
 * The denominator strips walks and HBPs to match conventional SLG (bases per AB,
 * not bases per PA). xSLG can exceed 1.0 — at the limit (every PA an HR) it is 4.0.
 */
export function xSlgFromPa(pa: PaOutcomes): number {
  const bases = pa.single + 2 * pa.double + 3 * pa.triple + 4 * pa.hr;
  const abShare = Math.max(1 - pa.bb - pa.hbp, 1e-9);
  return bases / abShare;
}

/**
 * Expected OBP for a single PA. Equal to `1 - k - ipOut` under the model. Surfaced
 * here for symmetry with `xSlgFromPa`; existing call sites that read `pReach`
 * directly are equivalent.
 */
export function xObpFromPa(pa: PaOutcomes): number {
  return 1 - pa.k - pa.ipOut;
}
