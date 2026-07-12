import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// GET /api/marketplace/purchase-counts
// Returns a map of { asset_id: total_purchases } across ALL buyers.
// Uses the service role so it isn't limited by per-user RLS on purchased_assets.
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("purchased_assets")
      .select("asset_id");

    if (error) {
      return NextResponse.json({ counts: {} });
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      if (!row.asset_id) return;
      counts[row.asset_id] = (counts[row.asset_id] ?? 0) + 1;
    });

    return NextResponse.json({ counts });
  } catch {
    return NextResponse.json({ counts: {} });
  }
}
