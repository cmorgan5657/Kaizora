import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const { asset_id, license_id } = await req.json();
    if (!asset_id) {
      return NextResponse.json({ error: "asset_id required" }, { status: 400 });
    }

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("id, owner_id, title, description, category, tags, is_public")
      .eq("id", asset_id)
      .single();

    if (assetError || !asset || !asset.is_public) {
      return NextResponse.json({ error: "Asset not found or not public" }, { status: 404 });
    }

    const { data: existingListing } = await supabaseAdmin
      .from("listings")
      .select("id")
      .eq("cover_asset_id", asset.id)
      .eq("status", "public")
      .maybeSingle();

    if (existingListing?.id) {
      return NextResponse.json({ listing_id: existingListing.id });
    }

    // The legacy listings table has a narrower license_type check constraint
    // than the modern asset_licenses table. The buyer's real selected license
    // is stored on cart.license_id, so this compatibility row uses a safe
    // legacy value only to satisfy cart.listing_id's foreign key.
    const legacyListingLicenseType = "personal_use";

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .insert({
        creator_id: asset.owner_id,
        title: asset.title || "Untitled asset",
        description: asset.description || null,
        currency: "usd",
        license_type: legacyListingLicenseType,
        status: "public",
        category: asset.category || null,
        tags: Array.isArray(asset.tags) ? asset.tags : null,
        cover_asset_id: asset.id,
      })
      .select("id")
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { error: listingError?.message || "Failed to create listing" },
        { status: 500 },
      );
    }

    return NextResponse.json({ listing_id: listing.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
