import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendContentFlaggedEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const { asset_id, reason, description } = await req.json();
    if (!asset_id || !reason) {
      return NextResponse.json({ error: "asset_id and reason are required" }, { status: 400 });
    }

    // Fetch the asset
    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("id, owner_id, title")
      .eq("id", asset_id)
      .single();

    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // Can't report your own asset
    if (asset.owner_id === userData.user.id) {
      return NextResponse.json({ error: "You cannot report your own asset" }, { status: 400 });
    }

    // Check if this user already reported this asset
    const { data: existing } = await supabaseAdmin
      .from("content_flags")
      .select("id")
      .eq("asset_id", asset_id)
      .eq("reporter_id", userData.user.id)
      .eq("source", "user_report")
      .eq("status", "pending")
      .single();

    if (existing) {
      return NextResponse.json({ error: "You have already reported this asset" }, { status: 400 });
    }

    // Insert the report
    await supabaseAdmin.from("content_flags").insert({
      asset_id,
      source: "user_report",
      status: "pending",
      reporter_id: userData.user.id,
      report_reason: reason,
      report_description: description || null,
    });

    // In-app notification for the asset owner
    try {
      createNotification({
        user_id: asset.owner_id,
        type: "content_flagged",
        title: "Your content was reported",
        body: `A user reported "${asset.title || "Untitled"}"`,
        link: "/creator/reports",
      }).catch(() => {});
    } catch {
      // ignore
    }

    // Fire-and-forget: notify the asset owner that their content was flagged
    try {
      const { data: ownerAuth } = await supabaseAdmin.auth.admin.getUserById(
        asset.owner_id,
      );
      const ownerEmail = ownerAuth?.user?.email;
      if (ownerEmail) {
        sendContentFlaggedEmail({
          to: ownerEmail,
          assetTitle: asset.title || "Untitled",
          source: "user_report",
          reason: `A user reported your content for: ${reason}`,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("[dmca/report] notify owner failed", e);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
