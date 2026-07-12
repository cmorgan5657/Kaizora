import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { moderateAsset } from "@/lib/ai/contentModerationAgent";
import {
  sendContentAutoBlockedEmail,
  sendContentFlaggedEmail,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";

// Mirrors /api/assets/moderate but for community posts — uses the `posts`
// storage bucket and writes flags keyed by post_id.
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
    console.error("[posts/moderate] notify owner failed", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user)
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const { post_id } = await req.json();
    if (!post_id)
      return NextResponse.json({ error: "post_id required" }, { status: 400 });

    const { data: post, error: postErr } = await supabaseAdmin
      .from("posts")
      .select("id, user_id, content_type, storage_path, thumbnail_path, title, description")
      .eq("id", post_id)
      .single();

    if (postErr || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only the post owner can trigger moderation.
    if (post.user_id !== userData.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Posts can be text-only (no storage_path). If there's nothing to scan
    // beyond title/description, run the agent in metadata-only mode.
    const result = await moderateAsset({
      id: post.id,
      content_type: post.content_type || "text",
      storage_path: post.storage_path || "",
      thumbnail_path: post.thumbnail_path,
      title: post.title || "",
      description: post.description,
      bucket: "posts",
      user_id: post.user_id,
    });

    if (result.is_safe) {
      await supabaseAdmin
        .from("posts")
        .update({ is_public: true, moderation_status: "approved" })
        .eq("id", post_id);

      // Audit row for approved scans (admins can see successful moderation).
      await supabaseAdmin.from("content_flags").insert({
        post_id,
        source: "ai_scan",
        status: "approved",
        severity: null,
        categories: result.scores,
        ai_explanation: result.explanation,
        reviewed_by: userData.user.id,
        reviewed_at: new Date().toISOString(),
        admin_note: `Auto-approved by AI moderation`,
      });

      return NextResponse.json({
        safe: true,
        severity: "none",
        scores: result.scores,
        explanation: result.explanation,
      });
    } else {
      // Check admin setting: auto-delete community posts or hide for review.
      let modSettings: { auto_delete_community: boolean } | null = null;
      try {
        const { data } = await supabaseAdmin
          .from("moderation_settings")
          .select("auto_delete_community")
          .limit(1)
          .single();
        modSettings = data;
      } catch { /* use default */ }

      const autoDelete = modSettings?.auto_delete_community ?? false;

      if (autoDelete) {
        // Auto-delete: permanently remove files + row.
        const filesToRemove = [post.storage_path, post.thumbnail_path].filter(
          (p): p is string => !!p,
        );
        if (filesToRemove.length > 0) {
          await supabaseAdmin.storage.from("posts").remove(filesToRemove).catch(() => {});
        }
        await supabaseAdmin.from("posts").delete().eq("id", post_id);
      } else {
        // Hide and send to admin for review.
        await supabaseAdmin
          .from("posts")
          .update({
            is_public: false,
            moderation_status:
              result.severity === "high" ? "flagged_high" : "flagged_medium",
          })
          .eq("id", post_id);

        await supabaseAdmin.from("content_flags").insert({
          post_id,
          source: "ai_scan",
          status: "pending",
          severity: result.severity,
          categories: result.scores,
          ai_explanation: result.explanation,
        });
      }

      try {
        if (result.severity === "high") {
          createNotification({
            user_id: post.user_id,
            type: "content_blocked",
            title: "Your post was blocked",
            body: `"${post.title || "Untitled"}" was blocked by our AI moderation and is under admin review`,
            link: "/creator/reports",
          }).catch(() => {});
        } else {
          createNotification({
            user_id: post.user_id,
            type: "content_flagged",
            title: "Your post is under review",
            body: `"${post.title || "Untitled"}" was flagged by our AI for admin review`,
            link: "/creator/reports",
          }).catch(() => {});
        }
      } catch {
        // ignore
      }

      try {
        if (result.severity === "high") {
          await notifyOwner(post.user_id, (email) =>
            sendContentAutoBlockedEmail({
              to: email,
              assetTitle: post.title || "Untitled",
              categories: (result.scores || {}) as any,
            }),
          );
        } else {
          await notifyOwner(post.user_id, (email) =>
            sendContentFlaggedEmail({
              to: email,
              assetTitle: post.title || "Untitled",
              source: "ai_scan",
              reason: "Our AI detected possible policy violations",
            }),
          );
        }
      } catch (e) {
        console.error("[posts/moderate] email error", e);
      }

      return NextResponse.json({
        safe: false,
        severity: result.severity,
        scores: result.scores,
        explanation: result.explanation,
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
