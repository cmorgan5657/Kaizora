import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: notifications, error: nErr } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (nErr) {
      console.error("Notifications query error:", nErr);
      return NextResponse.json({
        notifications: [],
        unread_count: 0,
        degraded: true,
      });
    }

    const { count, error: cErr } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (cErr) {
      console.error("Notifications count error:", cErr);
      return NextResponse.json({
        notifications: notifications || [],
        unread_count: 0,
        degraded: true,
      });
    }

    return NextResponse.json({
      notifications: notifications || [],
      unread_count: count || 0,
    });
  } catch (e: any) {
    console.error("Notifications route failed:", e);
    return NextResponse.json({
      notifications: [],
      unread_count: 0,
      degraded: true,
    });
  }
}
