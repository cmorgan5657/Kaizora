import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * POST /api/assets/[id]/click → increment clicks_count.
 * Lightweight, no auth required, fire-and-forget from the client when an asset is opened.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("clicks_count")
      .eq("id", id)
      .maybeSingle();
    if (!asset) return NextResponse.json({ ok: false }, { status: 404 });

    await supabaseAdmin
      .from("assets")
      .update({ clicks_count: (asset.clicks_count || 0) + 1 })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
