import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { moderateAsset } from "@/lib/ai/contentModerationAgent";
import {
  sendContentAutoBlockedEmail,
  sendContentFlaggedEmail,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { serverLog } from "@/lib/debugLogs";

// Video frame + audio extraction can take a while — give the scan room.
export const maxDuration = 300;

async function notifyOwner(
  ownerId: string,
  notify: (email: string) => Promise<void>,
) {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    const email = data?.user?.email;
    if (email) {
      notify(email).catch(() => {});
    }
  } catch (e) {
    console.error("[assets/moderate] notify owner failed", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const { asset_id } = await req.json();
    if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });

    // Fetch the asset
    const { data: asset, error: assetErr } = await supabaseAdmin
      .from("assets")
      .select("id, owner_id, content_type, storage_path, thumbnail_path, title, description")
      .eq("id", asset_id)
      .single();

    if (assetErr || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Only owner can trigger moderation (or it's called server-side)
    if (asset.owner_id !== userData.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Run AI moderation
    const result = await moderateAsset({
      id: asset.id,
      content_type: asset.content_type,
      storage_path: asset.storage_path,
      thumbnail_path: asset.thumbnail_path,
      title: asset.title,
      description: asset.description,
      user_id: asset.owner_id,
    });

    serverLog("KAIZORA_LOG_API_ASSET_MODERATION", "info", "[assets/moderate] result", {
      assetId: asset.id,
      ownerId: asset.owner_id,
      contentType: asset.content_type,
      title: asset.title,
      severity: result.severity,
      isSafe: result.is_safe,
      scores: result.scores,
      explanation: result.explanation,
      scanned: result.scanned,
      highThreshold: result.high_threshold,
      mediumThreshold: result.medium_threshold,
    });

    if (result.is_safe) {
      // ── Clean — publish the asset ──
      await supabaseAdmin
        .from("assets")
        .update({ is_public: true, moderation_status: "approved" })
        .eq("id", asset_id);

      // Notify the creator that their asset is now live.
      createNotification({
        user_id: asset.owner_id,
        type: "asset_published",
        title: "Your asset is live",
        body: `"${asset.title || "Untitled"}" passed review and is on the marketplace`,
        link: "/creator/assets",
        metadata: { asset_id },
      });

      // Keep an audit trail for successful scans too. Previously only flagged
      // scans were written, which made approved moderation invisible to admins.
      await supabaseAdmin.from("content_flags").insert({
        asset_id,
        source: "ai_scan",
        status: "approved",
        severity: null,
        categories: result.scores,
        ai_explanation: result.explanation,
        reviewed_by: userData.user.id,
        reviewed_at: new Date().toISOString(),
        admin_note: `Auto-approved by AI moderation (${result.scanned})`,
      });

      return NextResponse.json({
        safe: true,
        severity: "none",
        scores: result.scores,
        explanation: result.explanation,
      });
    } else {
      // ── Flagged — keep hidden, insert content_flag ──
      await supabaseAdmin
        .from("assets")
        .update({
          is_public: false,
          moderation_status: result.severity === "high" ? "flagged_high" : "flagged_medium",
        })
        .eq("id", asset_id);

      await supabaseAdmin.from("content_flags").insert({
        asset_id,
        source: "ai_scan",
        status: "pending",
        severity: result.severity,
        categories: result.scores,
        ai_explanation: result.explanation,
      });

      // In-app notification to owner
      try {
        if (result.severity === "high") {
          createNotification({
            user_id: asset.owner_id,
            type: "content_blocked",
            title: "Your upload was blocked",
            body: `"${asset.title || "Untitled"}" was blocked by our AI moderation`,
            link: "/creator/reports",
          }).catch(() => {});
        } else {
          createNotification({
            user_id: asset.owner_id,
            type: "content_flagged",
            title: "Your content is under review",
            body: `"${asset.title || "Untitled"}" was flagged by our AI for admin review`,
            link: "/creator/reports",
          }).catch(() => {});
        }
      } catch {
        // ignore
      }

      // Fire-and-forget email to owner
      try {
        if (result.severity === "high") {
          await notifyOwner(asset.owner_id, (email) =>
            sendContentAutoBlockedEmail({
              to: email,
              assetTitle: asset.title || "Untitled",
              categories: (result.scores || {}) as any,
            }),
          );
        } else {
          await notifyOwner(asset.owner_id, (email) =>
            sendContentFlaggedEmail({
              to: email,
              assetTitle: asset.title || "Untitled",
              source: "ai_scan",
              reason: "Our AI detected possible policy violations",
            }),
          );
        }
      } catch (e) {
        console.error("[assets/moderate] email error", e);
      }

      return NextResponse.json({
        safe: false,
        severity: result.severity,
        scores: result.scores,
        explanation: result.explanation,
      });
    }
  } catch (e: any) {
    serverLog("KAIZORA_LOG_API_ASSET_MODERATION", "error", "[assets/moderate] failed", {
      message: e?.message,
      stack: e?.stack,
    });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
