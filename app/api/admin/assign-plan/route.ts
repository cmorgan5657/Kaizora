import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const { userId, planId, adminId } = await req.json();

    if (!userId || !planId || !adminId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify admin is superadmin
    const { data: admin } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminId)
      .single();

    if (!admin || admin.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if user already has a subscription
    const { data: existing } = await supabase
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existing) {
      // Update existing subscription
      const { error } = await supabase
        .from("user_subscriptions")
        .update({
          plan_id: planId,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
    } else {
      // Create new subscription
      const { error } = await supabase.from("user_subscriptions").insert({
        user_id: userId,
        plan_id: planId,
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Plan assigned successfully",
    });
  } catch (error: any) {
    console.error("Error assigning plan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to assign plan" },
      { status: 500 }
    );
  }
}
