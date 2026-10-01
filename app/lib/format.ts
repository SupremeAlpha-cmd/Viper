/**
 * Pure token-amount formatting helpers (no deps — safe to unit-test with
 * plain node).
 */

/** Format a raw token amount using the token's decimals. */
export function formatTokens(v: bigint, decimals: number): string {
  if (decimals === 0) return v.toString();
  const s = v.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).replace(/0+$/, "").slice(0, 4);
  return frac ? `${int}.${frac}` : int;
}
