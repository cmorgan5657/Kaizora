import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { optimizeSearch } from "@/lib/ai/searchOptimizationAgent";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;
    const body = await req.json();
    const { asset_id } = body;

    if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });

    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("id, title, description, category, tags")
      .eq("id", asset_id)
      .eq("owner_id", userId)
      .single();

    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // Get keywords from commerce profile if exists
    const { data: profile } = await supabaseAdmin
      .from("asset_commerce_profiles")
      .select("suggested_keywords")
      .eq("asset_id", asset_id)
      .maybeSingle();

    const result = await optimizeSearch({
      ...asset,
      keywords: profile?.suggested_keywords || [],
    });

    if (!result) return NextResponse.json({ error: "Search optimization failed" }, { status: 500 });

    // Update commerce profile with optimized data
    if (profile) {
      await supabaseAdmin
        .from("asset_commerce_profiles")
        .update({
          suggested_tags: result.optimized_tags,
          suggested_keywords: result.optimized_keywords,
          updated_at: new Date().toISOString(),
        })
        .eq("asset_id", asset_id);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Search optimize error:", error);
    return NextResponse.json({ error: "Failed", details: error.message }, { status: 500 });
  }
}
