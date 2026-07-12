/**
 * Credit expiry helpers — single rolling expiry, 30 days flat.
 * A user's whole balance shares one expiry date = latest top-up + 30 days.
 * These are pure functions, safe to use on both server and client.
 */

export const CREDIT_EXPIRY_DAYS = 30;
export const ANNUAL_CREDIT_EXPIRY_DAYS = 365;

/** Days a top-up pack's credits stay valid, based on its tier. */
export function packExpiryDays(tier: string | null | undefined): number {
  return tier === "year" ? ANNUAL_CREDIT_EXPIRY_DAYS : CREDIT_EXPIRY_DAYS;
}

/**
 * ISO timestamp `days` from now — set on every credit top-up.
 * Defaults to the standard 30-day window; annual packs pass 365.
 */
export function newCreditExpiry(
  days: number = CREDIT_EXPIRY_DAYS,
  from: Date = new Date(),
): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** True if the balance has expired (expiry date is in the past). */
export function isCreditsExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/** Spendable balance: 0 if expired, otherwise the raw balance. */
export function availableBalance(
  balance: number | null | undefined,
  expiresAt: string | null | undefined,
): number {
  if (isCreditsExpired(expiresAt)) return 0;
  return balance ?? 0;
}

/** Whole days left until expiry (0 if expired/none). For UI display. */
export function daysUntilExpiry(
  expiresAt: string | null | undefined,
): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
