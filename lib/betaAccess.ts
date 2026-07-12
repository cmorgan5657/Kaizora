export const BETA_EMAIL_COOKIE = "kz_user_email";
export const BETA_TESTER_EMAIL_REGEX = /^betatester([1-9]|1[0-2])@gmail\.com$/i;

export function isBetaTesterEmail(email?: string | null): boolean {
  if (!email) return false;
  return BETA_TESTER_EMAIL_REGEX.test(email.trim().toLowerCase());
}

export function setBetaEmailCookie(email?: string | null) {
  if (typeof document === "undefined") return;
  if (!email) {
    clearBetaEmailCookie();
    return;
  }

  document.cookie = `${BETA_EMAIL_COOKIE}=${encodeURIComponent(
    email.toLowerCase(),
  )}; path=/; max-age=2592000; samesite=lax`;
}

export function clearBetaEmailCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${BETA_EMAIL_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
