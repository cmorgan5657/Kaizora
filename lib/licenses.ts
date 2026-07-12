// Central source of truth for KAIZORA's license model.
//
// KAIZORA offers exactly THREE licenses. Their permissions are fixed by the
// platform (they are NOT admin-editable per-asset rules):
//
//   Personal Use   — view + download for personal use only. No remix, no resell.
//   Commercial Use — view + download + remix + resell. The license stays LOCKED
//                    to Commercial when resold, and a royalty is paid to the
//                    original creator on every downstream sale.
//   Royalty-Free   — full rights: view + download + remix + resell, and the
//                    buyer may relist under any license. No royalty owed.

export type LicenseSlug = "personal" | "commercial" | "royalty-free";

export interface LicenseRule {
  slug: LicenseSlug;
  /** Full display name (matches the `license_types.name` column). */
  name: string;
  /** Short label for chips / filters. */
  shortLabel: string;
  canView: boolean;
  canDownload: boolean;
  canRemix: boolean;
  canResell: boolean;
  /**
   * When the holder of THIS license sells a remix/resale of the asset,
   * does the original creator receive a royalty cut?
   *   Commercial   → true  (original creator earns the royalty %)
   *   Royalty-Free → false (buyer owns full rights, no royalty)
   *   Personal     → false (can't remix/resell at all)
   */
  owesRoyaltyToOriginalCreator: boolean;
}

export const LICENSE_RULES: Record<LicenseSlug, LicenseRule> = {
  personal: {
    slug: "personal",
    name: "Personal Use",
    shortLabel: "Personal",
    canView: true,
    canDownload: true,
    canRemix: false,
    canResell: false,
    owesRoyaltyToOriginalCreator: false,
  },
  commercial: {
    slug: "commercial",
    name: "Commercial Use",
    shortLabel: "Commercial",
    canView: true,
    canDownload: true,
    canRemix: true,
    canResell: true,
    owesRoyaltyToOriginalCreator: true,
  },
  "royalty-free": {
    slug: "royalty-free",
    name: "Royalty-Free",
    shortLabel: "Royalty-Free",
    canView: true,
    canDownload: true,
    canRemix: true,
    canResell: true,
    owesRoyaltyToOriginalCreator: false,
  },
};

/** The only license slugs KAIZORA supports, cheapest → most permissive. */
export const ACTIVE_LICENSE_SLUGS: LicenseSlug[] = [
  "personal",
  "commercial",
  "royalty-free",
];

/** Slugs that are no longer offered — kept so old data still resolves. */
export const RETIRED_LICENSE_SLUGS = ["extended"];

/** Default platform royalty % paid to the original creator on downstream sales. */
export const DEFAULT_ROYALTY_PERCENT = 3;

/** Normalize any incoming license value to one of the 3 supported slugs. */
export function normalizeLicenseSlug(slug?: string | null): LicenseSlug | null {
  if (!slug) return null;
  const s = String(slug).toLowerCase().trim();
  if (s === "personal") return "personal";
  if (s === "commercial") return "commercial";
  if (s === "royalty-free" || s === "royalty_free" || s === "royaltyfree")
    return "royalty-free";
  // Retired "extended" maps to the closest current tier.
  if (s === "extended") return "royalty-free";
  return null;
}

/** Get the rule object for a license slug (null if unknown). */
export function getLicenseRule(slug?: string | null): LicenseRule | null {
  const normalized = normalizeLicenseSlug(slug);
  return normalized ? LICENSE_RULES[normalized] : null;
}

export function canRemixWith(slug?: string | null): boolean {
  return getLicenseRule(slug)?.canRemix ?? false;
}

export function canResellWith(slug?: string | null): boolean {
  return getLicenseRule(slug)?.canResell ?? false;
}

export function owesRoyalty(slug?: string | null): boolean {
  return getLicenseRule(slug)?.owesRoyaltyToOriginalCreator ?? false;
}
