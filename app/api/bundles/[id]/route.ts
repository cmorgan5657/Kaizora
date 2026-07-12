import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: bundle, error } = await supabaseAdmin
      .from("bundles")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    // Fetch all assets in the bundle
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id, title, description, category, price_cents, storage_path, thumbnail_path, content_type, owner_id, views_count, purchases_count")
      .in("id", bundle.asset_ids);

    // Fetch creator profile
    const { data: creator } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", bundle.creator_id as string)
      .maybeSingle();

    return NextResponse.json({ bundle, assets: assets || [], creator: creator || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
