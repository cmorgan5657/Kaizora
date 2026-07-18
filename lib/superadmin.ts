export const SUPERADMIN_EMAIL = "superadmin@gmail.com";

export function isSuperadminEmail(email?: string | null): boolean {
  return (email || "").trim().toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
}

export function isSuperadminRole(role?: string | null): boolean {
  return (role || "").trim().toLowerCase() === "superadmin";
}
