import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const creator_id = searchParams.get("creator_id");

    let query = supabaseAdmin
      .from("bundles")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (creator_id) query = query.eq("creator_id", creator_id) as any;

    const { data: bundles, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!bundles || bundles.length === 0) {
      return NextResponse.json({ bundles: [] });
    }

    // Fetch first 4 asset thumbnails for each bundle (for collage)
    const enriched = await Promise.all(
      bundles.map(async (bundle) => {
        const first4 = (bundle.asset_ids || []).slice(0, 4);
        if (first4.length === 0) return { ...bundle, collage_urls: [] };

        const { data: assets } = await supabaseAdmin
          .from("assets")
          .select("id, thumbnail_path, storage_path, content_type")
          .in("id", first4);

        const collage_urls = (assets || []).map((a) => {
          const path = (a as any).thumbnail_path || a.storage_path || null;
          if (!path) return null;
          if (path.startsWith("http")) return path;
          return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
        }).filter(Boolean);

        return { ...bundle, collage_urls };
      })
    );

    return NextResponse.json({ bundles: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
