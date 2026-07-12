import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { suggestPackaging } from "@/lib/ai/packagingAgent";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;

    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id, title, description, category, tags, content_type, price_cents")
      .eq("owner_id", userId);

    if (!assets || assets.length === 0) {
      return NextResponse.json({ success: true, suggestions: [], message: "No assets found" });
    }

    const result = await suggestPackaging(assets);
    if (!result) return NextResponse.json({ error: "Packaging analysis failed" }, { status: 500 });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Packaging route error:", error);
    return NextResponse.json({ error: "Failed", details: error.message }, { status: 500 });
  }
}
