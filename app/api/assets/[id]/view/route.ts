import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * POST /api/assets/[id]/view
 *
 * Increments views_count when an asset detail page is opened.
 * Skips the increment if the viewer is the asset owner.
 *
 * Auth is optional — anonymous viewers count as a real view.
 * Owners are identified via their Bearer token; missing/invalid tokens
 * just mean "anonymous", which still counts as a view.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("owner_id, views_count")
      .eq("id", id)
      .maybeSingle();

    if (!asset) return NextResponse.json({ ok: false }, { status: 404 });

    // Identify the viewer (optional auth). If they're the owner, skip.
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (userData?.user && userData.user.id === asset.owner_id) {
        return NextResponse.json({ ok: true, skipped: "owner" });
      }
    }

    await supabaseAdmin
      .from("assets")
      .update({ views_count: (asset.views_count || 0) + 1 })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
