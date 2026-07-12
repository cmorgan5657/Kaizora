import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * POST /api/assets/[id]/save → toggle save (idempotent).
 * GET  /api/assets/[id]/save → returns { saved: boolean } for current user.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;

    // Toggle: check if exists
    const { data: existing } = await supabaseAdmin
      .from("asset_saves")
      .select("user_id")
      .eq("user_id", userId)
      .eq("asset_id", id)
      .maybeSingle();

    if (existing) {
      // Unsave
      await supabaseAdmin
        .from("asset_saves")
        .delete()
        .eq("user_id", userId)
        .eq("asset_id", id);

      // Decrement saves_count (floor at 0)
      const { data: asset } = await supabaseAdmin
        .from("assets")
        .select("saves_count")
        .eq("id", id)
        .maybeSingle();
      const newCount = Math.max(0, (asset?.saves_count || 0) - 1);
      await supabaseAdmin.from("assets").update({ saves_count: newCount }).eq("id", id);

      return NextResponse.json({ saved: false, saves_count: newCount });
    } else {
      // Save
      await supabaseAdmin.from("asset_saves").insert({ user_id: userId, asset_id: id });
      const { data: asset } = await supabaseAdmin
        .from("assets")
        .select("saves_count")
        .eq("id", id)
        .maybeSingle();
      const newCount = (asset?.saves_count || 0) + 1;
      await supabaseAdmin.from("assets").update({ saves_count: newCount }).eq("id", id);

      return NextResponse.json({ saved: true, saves_count: newCount });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ saved: false });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ saved: false });

    const { data } = await supabaseAdmin
      .from("asset_saves")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .eq("asset_id", id)
      .maybeSingle();

    return NextResponse.json({ saved: !!data });
  } catch {
    return NextResponse.json({ saved: false });
  }
}
