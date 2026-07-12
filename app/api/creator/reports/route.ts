import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = userData.user;

    // ── 1. Flags ON my assets ────────────────────────────────────────────
    const { data: myAssets } = await supabaseAdmin
      .from("assets")
      .select("id, title, content_type, storage_path, thumbnail_path")
      .eq("owner_id", user.id);

    let flagsOnMyAssets: any[] = [];
    if (myAssets && myAssets.length > 0) {
      const assetMap = new Map(myAssets.map((a: any) => [a.id, a]));
      const { data: flags } = await supabaseAdmin
        .from("content_flags")
        .select("id, asset_id, source, status, severity, categories, ai_explanation, report_reason, report_description, created_at, reviewed_at, admin_note, reporter_id")
        .in("asset_id", myAssets.map((a: any) => a.id))
        .order("created_at", { ascending: false });

      if (flags && flags.length > 0) {
        // Fetch reporter display names
        const reporterIds = [...new Set(flags.filter((f: any) => f.reporter_id).map((f: any) => f.reporter_id as string))];
        const profileMap = new Map<string, string>();
        if (reporterIds.length > 0) {
          const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", reporterIds);
          (profiles || []).forEach((p: any) => profileMap.set(p.id, p.display_name || "Anonymous"));
        }

        flagsOnMyAssets = flags.map((f: any) => ({
          ...f,
          perspective: "received",
          asset: assetMap.get(f.asset_id) || null,
          reporter: f.reporter_id ? { display_name: profileMap.get(f.reporter_id) || "Anonymous" } : null,
        }));
      }
    }

    // ── 2. Reports I SUBMITTED ───────────────────────────────────────────
    const { data: myReports } = await supabaseAdmin
      .from("content_flags")
      .select("id, asset_id, source, status, severity, categories, ai_explanation, report_reason, report_description, created_at, reviewed_at, admin_note, reporter_id")
      .eq("reporter_id", user.id)
      .eq("source", "user_report")
      .order("created_at", { ascending: false });

    let flagsISubmitted: any[] = [];
    if (myReports && myReports.length > 0) {
      // Fetch the reported assets + their owners
      const reportedAssetIds = [...new Set(myReports.map((r: any) => r.asset_id).filter(Boolean))];
      const { data: reportedAssets } = await supabaseAdmin
        .from("assets")
        .select("id, title, content_type, storage_path, thumbnail_path, owner_id")
        .in("id", reportedAssetIds);

      // Fetch owner display names
      const ownerIds = [...new Set((reportedAssets || []).map((a: any) => a.owner_id).filter(Boolean))];
      const ownerMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: owners } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ownerIds);
        (owners || []).forEach((o: any) => ownerMap.set(o.id, o.display_name || "Unknown"));
      }

      const assetMap2 = new Map((reportedAssets || []).map((a: any) => [a.id, {
        ...a,
        owner_name: ownerMap.get(a.owner_id) || "Unknown",
      }]));

      flagsISubmitted = myReports.map((r: any) => ({
        ...r,
        perspective: "submitted",
        asset: assetMap2.get(r.asset_id) || null,
        reporter: null,
      }));
    }

    return NextResponse.json({
      received: flagsOnMyAssets,   // flags on my assets
      submitted: flagsISubmitted,  // reports I filed
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
