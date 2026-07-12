import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover" as any,
});

export async function POST(req: Request) {
  try {
    console.log("🔍 [CHECK-STATUS] Starting...");

    // 1. Read auth token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      console.log("❌ [CHECK-STATUS] No token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get user
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const user = data?.user;

    if (error || !user) {
      console.log("❌ [CHECK-STATUS] Invalid user:", error);
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    console.log("✅ [CHECK-STATUS] User:", user.id);

    // 3. Get Stripe account ID from DB
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_onboarding_status")
      .eq("id", user.id)
      .single();

    console.log("📦 [CHECK-STATUS] Profile:", profile);

    if (!profile?.stripe_account_id) {
      console.log("⚠️ [CHECK-STATUS] No stripe_account_id");
      return NextResponse.json({ status: "not_connected" });
    }

    console.log(
      "💳 [CHECK-STATUS] Retrieving Stripe account:",
      profile.stripe_account_id
    );

    // 4. Ask Stripe for account status
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    console.log("📡 [CHECK-STATUS] Full Stripe Account Details:", {
      id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
      capabilities: account.capabilities,
      type: account.type,
    });

    const isCompleted =
      account.charges_enabled === true && account.payouts_enabled === true;

    console.log("📊 [CHECK-STATUS] isCompleted:", isCompleted);

    // 5. Update DB if completed
    if (isCompleted) {
      console.log("💾 [CHECK-STATUS] Updating profile to completed");
      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_onboarding_status: "completed",
          stripe_connected_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    // 6. Respond to frontend
    const response = {
      status: isCompleted ? "completed" : "pending",
      debug: {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      },
    };

    console.log("🎉 [CHECK-STATUS] Sending response:", response);

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("❌ [CHECK-STATUS] Error:", err);
    return NextResponse.json(
      {
        error: "Stripe check failed",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
