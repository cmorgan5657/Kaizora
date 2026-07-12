import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { stripe } from "@/lib/stripe";

// Permanently delete the authenticated user's account:
//  1. Cancel any Stripe subscriptions so billing stops.
//  2. Remove the user's rows from user-scoped tables.
//  3. Delete the auth user (removes login).
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "Invalid user" }, { status: 401 });
  }
  const userId = user.id;

  // 1. Cancel Stripe subscriptions (credit + legacy) so the card stops being charged.
  for (const table of ["user_credit_subscriptions", "user_subscriptions"]) {
    try {
      const { data: subs } = await supabaseAdmin
        .from(table)
        .select("stripe_subscription_id, status")
        .eq("user_id", userId);
      for (const s of subs || []) {
        if (s?.stripe_subscription_id && s.status !== "canceled") {
          try {
            await stripe.subscriptions.cancel(s.stripe_subscription_id);
          } catch {
            // subscription may already be gone in Stripe — ignore
          }
        }
      }
    } catch {
      // table may not exist / no rows — ignore
    }
  }

  // 2. Best-effort cleanup of user-scoped rows (tables that don't cascade).
  const userTables = [
    "notifications",
    "credit_transactions",
    "user_credits",
    "auto_topup_settings",
    "balance_notification_settings",
    "user_credit_subscriptions",
    "user_subscriptions",
  ];
  for (const t of userTables) {
    try {
      await supabaseAdmin.from(t).delete().eq("user_id", userId);
    } catch {
      // ignore missing tables
    }
  }
  try {
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
  } catch {
    // ignore
  }

  // 3. Delete the auth user — this removes their ability to log in.
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[account/delete] deleteUser failed:", error.message);
    return NextResponse.json(
      { error: "Failed to delete account. Please contact support." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
