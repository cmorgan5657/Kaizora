import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import {
  normalizeLicenseSlug,
  getLicenseRule,
  type LicenseSlug,
} from "@/lib/licenses";

// Permissiveness ranking — used to pick a buyer's strongest license on an asset.
const RANK: Record<LicenseSlug, number> = {
  personal: 0,
  commercial: 1,
  "royalty-free": 2,
};

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user)
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    const userId = userData.user.id;

    const { asset_id, price_cents, license_slug } = await req.json();
    if (!asset_id)
      return NextResponse.json({ error: "asset_id required" }, { status: 400 });

    const price = Math.max(0, Math.round(Number(price_cents) || 0));

    // ── Verify the user owns this asset ──
    const { data: owned } = await supabaseAdmin
      .from("purchased_assets")
      .select("id")
      .eq("buyer_id", userId)
      .eq("asset_id", asset_id)
      .maybeSingle();
    if (!owned)
      return NextResponse.json(
        { error: "You do not own this asset" },
        { status: 403 },
      );

    // ── Find the strongest license the user holds on this asset ──
    const { data: plRows } = await supabaseAdmin
      .from("purchased_licenses")
      .select("license_type:license_types(slug)")
      .eq("buyer_id", userId)
      .eq("asset_id", asset_id);

    let held: LicenseSlug | null = null;
    for (const row of plRows || []) {
      const raw = Array.isArray((row as any).license_type)
        ? (row as any).license_type[0]?.slug
        : (row as any).license_type?.slug;
      const s = normalizeLicenseSlug(raw);
      if (s && (held === null || RANK[s] > RANK[held])) held = s;
    }

    if (!held)
      return NextResponse.json(
        { error: "No license found for this asset" },
        { status: 403 },
      );

    const heldRule = getLicenseRule(held);
    if (!heldRule?.canResell) {
      return NextResponse.json(
        { error: "Your license does not allow reselling this asset" },
        { status: 403 },
      );
    }

    // ── Load the source asset ──
    const { data: src, error: srcErr } = await supabaseAdmin
      .from("assets")
      .select(
        "id, owner_id, title, description, content_type, storage_path, thumbnail_path, ai_model, tags, origin_creator_id, origin_license",
      )
      .eq("id", asset_id)
      .single();
    if (srcErr || !src)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // ── Decide lineage tags + the license the resale is listed under ──
    let originCreatorId: string;
    let originLicense: string | null;
    let listingLicense: LicenseSlug;

    if (held === "commercial") {
      // Commercial — license is LOCKED, royalty stays with the original creator.
      originCreatorId = src.origin_creator_id || src.owner_id;
      originLicense = "commercial";
      listingLicense = "commercial";
    } else {
      // Royalty-Free — full rights. Reseller becomes the new origin and may
      // list under any license they choose.
      originCreatorId = userId;
      originLicense = null;
      listingLicense = normalizeLicenseSlug(license_slug) || "royalty-free";
    }

    // ── Resolve the license_type id for the listing license ──
    const { data: licType } = await supabaseAdmin
      .from("license_types")
      .select("id")
      .eq("slug", listingLicense)
      .eq("is_active", true)
      .maybeSingle();
    if (!licType) {
      return NextResponse.json(
        { error: `License "${listingLicense}" is not available.` },
        { status: 400 },
      );
    }

    // ── Create the reseller's own asset row (points to the same file) ──
    const { data: newAsset, error: insErr } = await supabaseAdmin
      .from("assets")
      .insert({
        owner_id: userId,
        title: src.title,
        description: src.description,
        content_type: src.content_type,
        storage_path: src.storage_path,
        thumbnail_path: src.thumbnail_path,
        ai_model: src.ai_model,
        tags: src.tags,
        price_cents: price,
        is_public: true,
        moderation_status: "approved",
        origin_creator_id: originCreatorId,
        origin_license: originLicense,
      })
      .select("id")
      .single();
    if (insErr || !newAsset)
      return NextResponse.json(
        { error: insErr?.message || "Failed to create listing" },
        { status: 500 },
      );

    // ── Make it sellable — link the license ──
    const { error: licErr } = await supabaseAdmin.from("asset_licenses").insert({
      asset_id: newAsset.id,
      license_type_id: licType.id,
      price_override: null,
      is_available: true,
    });
    if (licErr) {
      // Roll back the orphan asset so we don't leave a non-sellable listing.
      await supabaseAdmin.from("assets").delete().eq("id", newAsset.id);
      return NextResponse.json({ error: licErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      asset_id: newAsset.id,
      listing_license: listingLicense,
      license_locked: held === "commercial",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
