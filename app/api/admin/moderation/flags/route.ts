import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    if (userData.user.email !== SUPERADMIN_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Step 1: Fetch all flags
    const { data: flags, error: flagsError } = await supabaseAdmin
      .from("content_flags")
      .select("id, asset_id, post_id, source, status, severity, categories, ai_explanation, report_reason, report_description, created_at, reviewed_at, admin_note, reporter_id")
      .order("created_at", { ascending: false });

    if (flagsError) return NextResponse.json({ error: flagsError.message }, { status: 500 });
    if (!flags || flags.length === 0) return NextResponse.json({ flags: [] });

    // Step 2: Collect all user IDs we need (asset/post owners + reporters)
    const assetIds = [...new Set(flags.map((f: any) => f.asset_id).filter(Boolean))];
    const postIds = [...new Set(flags.map((f: any) => f.post_id).filter(Boolean))];
    const reporterIds = [...new Set(flags.map((f: any) => f.reporter_id).filter(Boolean))];

    // Build a public-URL helper per storage bucket.
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const pub = (bucket: string, p: string | null | undefined) =>
      p ? `${supaUrl}/storage/v1/object/public/${bucket}/${p}` : null;

    // Step 3: Fetch assets + posts
    const assetMap: Record<string, any> = {};
    let ownerIds: string[] = [];
    if (assetIds.length > 0) {
      const { data: assets } = await supabaseAdmin
        .from("assets")
        .select("id, title, content_type, storage_path, thumbnail_path, is_public, owner_id")
        .in("id", assetIds);
      ownerIds = [...new Set((assets || []).map((a: any) => a.owner_id).filter(Boolean))];
      (assets || []).forEach((a: any) => {
        assetMap[a.id] = {
          ...a,
          kind: "asset",
          preview_url: pub("assets", a.content_type === "image" ? a.storage_path : a.thumbnail_path),
        };
      });
    }

    // Posts are normalized into the same shape so the admin page renders them
    // identically. Their owner column is `user_id`, mapped to `owner_id`.
    if (postIds.length > 0) {
      const { data: posts } = await supabaseAdmin
        .from("posts")
        .select("id, title, content_type, storage_path, thumbnail_path, is_public, user_id")
        .in("id", postIds);
      const postOwnerIds = (posts || []).map((p: any) => p.user_id).filter(Boolean);
      ownerIds = [...new Set([...ownerIds, ...postOwnerIds])];
      (posts || []).forEach((p: any) => {
        assetMap[`post:${p.id}`] = {
          id: p.id,
          title: p.title,
          content_type: p.content_type,
          storage_path: p.storage_path,
          thumbnail_path: p.thumbnail_path,
          is_public: p.is_public,
          owner_id: p.user_id,
          kind: "post",
          preview_url: pub("posts", p.content_type === "image" ? p.storage_path : p.thumbnail_path),
        };
      });
    }

    // Step 4: Get all unique user IDs (owners + reporters) and fetch from auth + profiles in one pass
    const allUserIds = [...new Set([...ownerIds, ...reporterIds])];
    const userInfoMap: Record<string, { display_name: string | null; email: string }> = {};

    if (allUserIds.length > 0) {
      // Profiles for display_name
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", allUserIds);
      (profiles || []).forEach((p: any) => {
        userInfoMap[p.id] = { display_name: p.display_name, email: "" };
      });

      // Auth users for email (supabaseAdmin.auth.admin.listUsers doesn't support filter by IDs,
      // so fetch each user individually — only a handful of unique users per page load)
      await Promise.all(
        allUserIds.map(async (uid) => {
          try {
            const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
            if (data?.user?.email) {
              if (!userInfoMap[uid]) userInfoMap[uid] = { display_name: null, email: data.user.email };
              else userInfoMap[uid].email = data.user.email;
            }
          } catch { /**/ }
        })
      );
    }

    // Step 5: Assemble. Post flags are surfaced under `asset` too so the
    // existing admin page renders them with no changes; `kind` differentiates.
    const enriched = flags.map((f: any) => {
      const asset = f.post_id
        ? assetMap[`post:${f.post_id}`] || null
        : assetMap[f.asset_id] || null;
      const ownerInfo = asset?.owner_id ? (userInfoMap[asset.owner_id] || null) : null;
      const reporterInfo = f.reporter_id ? (userInfoMap[f.reporter_id] || null) : null;
      return {
        ...f,
        kind: asset?.kind || (f.post_id ? "post" : "asset"),
        asset: asset ? {
          ...asset,
          owner: ownerInfo ? {
            display_name: ownerInfo.display_name || ownerInfo.email || "Unknown",
            email: ownerInfo.email,
          } : null,
        } : null,
        reporter: reporterInfo ? {
          display_name: reporterInfo.display_name || reporterInfo.email || "Unknown",
          email: reporterInfo.email,
        } : null,
      };
    });

    return NextResponse.json({ flags: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
