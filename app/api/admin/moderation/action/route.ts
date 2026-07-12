import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";
import {
  sendContentRemovedEmail,
  sendReportResolvedEmail,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";

async function getUserEmail(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

async function getProfileName(uid: string | null | undefined): Promise<string> {
  if (!uid) return "";
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", uid)
    .single();
  return data?.display_name || "";
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    // Superadmin only
    if (userData.user.email !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { flag_id, action, admin_note } = await req.json();
    if (!flag_id || !action) {
      return NextResponse.json({ error: "flag_id and action required" }, { status: 400 });
    }
    if (!["approve", "remove"].includes(action)) {
      return NextResponse.json({ error: "action must be approve or remove" }, { status: 400 });
    }

    // Fetch the flag
    const { data: flag, error: flagErr } = await supabaseAdmin
      .from("content_flags")
      .select("id, asset_id, post_id, source, severity, categories, ai_explanation, report_reason, reporter_id")
      .eq("id", flag_id)
      .single();

    if (flagErr || !flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Resolve the target — asset or post. Same admin actions apply to both.
    const isPost = !!flag.post_id;
    const targetTable = isPost ? "posts" : "assets";
    const targetId = isPost ? flag.post_id : flag.asset_id;
    const ownerCol = isPost ? "user_id" : "owner_id";

    const { data: targetRow } = await supabaseAdmin
      .from(targetTable)
      .select(`id, title, ${ownerCol}, is_public`)
      .eq("id", targetId)
      .single();

    const assetTitle = (targetRow as any)?.title || "Untitled";
    const ownerId = (targetRow as any)?.[ownerCol] || null;
    const ownerEmail = await getUserEmail(ownerId);
    const isUserReport = flag.source === "user_report";

    if (action === "approve") {
      // ── Approve: unhide the target ──
      await supabaseAdmin
        .from(targetTable)
        .update({ is_public: true, moderation_status: "approved" })
        .eq("id", targetId);

      await supabaseAdmin
        .from("content_flags")
        .update({
          status: "approved",
          reviewed_by: userData.user.id,
          reviewed_at: new Date().toISOString(),
          admin_note: admin_note || null,
        })
        .eq("id", flag_id);

      // If it was a user report, notify the reporter that no action was taken
      if (isUserReport && flag.reporter_id) {
        try {
          createNotification({
            user_id: flag.reporter_id,
            type: "report_resolved",
            title: "Report reviewed — no action taken",
            body: `Admin reviewed your report on "${assetTitle}"`,
            link: "/creator/reports",
          }).catch(() => {});
        } catch {
          // ignore
        }
        try {
          const reporterEmail = await getUserEmail(flag.reporter_id);
          const reporterName = await getProfileName(flag.reporter_id);
          if (reporterEmail) {
            sendReportResolvedEmail({
              to: reporterEmail,
              reporterName,
              assetTitle,
              action: "dismissed",
            }).catch(() => {});
          }
        } catch {
          // ignore
        }
      }

      return NextResponse.json({ success: true, action: "approved" });
    }

    if (action === "remove") {
      // ── Remove ──
      // Community posts: permanently delete files + row (no private storage).
      // Marketplace assets: hide (keep row for DMCA/audit trail).
      if (isPost) {
        const postRow = targetRow as any;
        const filesToRemove = [postRow?.storage_path, postRow?.thumbnail_path].filter(Boolean) as string[];
        if (filesToRemove.length > 0) {
          await supabaseAdmin.storage.from("posts").remove(filesToRemove).catch(() => {});
        }
        await supabaseAdmin.from("posts").delete().eq("id", targetId);
        // Flag is cascade-deleted with the post — no need to update it.
      } else {
        await supabaseAdmin
          .from(targetTable)
          .update({ is_public: false, moderation_status: "removed" })
          .eq("id", targetId);

        await supabaseAdmin
          .from("content_flags")
          .update({
            status: "removed",
            reviewed_by: userData.user.id,
            reviewed_at: new Date().toISOString(),
            admin_note: admin_note || null,
          })
          .eq("id", flag_id);
      }

      const removalReason =
        flag.source === "ai_scan"
          ? `Our AI content moderation system detected policy violations: ${flag.ai_explanation || "content policy violation"}`
          : `A DMCA / copyright report was filed against this asset. Reason: ${flag.report_reason || "copyright violation"}`;

      // In-app notification to asset owner
      if (ownerId) {
        try {
          createNotification({
            user_id: ownerId,
            type: "content_removed",
            title: "Your asset has been removed",
            body: `"${assetTitle}" was removed for policy violations`,
            link: "/creator/reports",
          }).catch(() => {});
        } catch {
          // ignore
        }
      }

      // Email creator (fire-and-forget; sendContentRemovedEmail already catches internally)
      if (ownerEmail) {
        sendContentRemovedEmail({
          to: ownerEmail,
          assetTitle,
          reason: removalReason,
          adminNote: admin_note || "",
        }).catch(() => {});
      }

      // Also email the reporter if this was a user report
      if (isUserReport && flag.reporter_id) {
        try {
          createNotification({
            user_id: flag.reporter_id,
            type: "report_resolved",
            title: "Your report led to a removal",
            body: `Admin removed "${assetTitle}"`,
            link: "/creator/reports",
          }).catch(() => {});
        } catch {
          // ignore
        }
        try {
          const reporterEmail = await getUserEmail(flag.reporter_id);
          const reporterName = await getProfileName(flag.reporter_id);
          if (reporterEmail) {
            sendReportResolvedEmail({
              to: reporterEmail,
              reporterName,
              assetTitle,
              action: "removed",
            }).catch(() => {});
          }
        } catch {
          // ignore
        }
      }

      return NextResponse.json({ success: true, action: "removed" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
