import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover" as any,
});
function getBaseUrl(req: Request) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
export async function POST(req: Request) {
  try {
    // 1. Read access token sent from frontend
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get logged-in user using token
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const user = data?.user;

    if (error || !user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    // 3. Check if user already has a Stripe account
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .single();

    let accountId = profile?.stripe_account_id;

    // 4. Create account only if one doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email ?? undefined,
      });

      accountId = account.id;

      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_status: "pending",
        })
        .eq("id", user.id);
    }

    // 5. Create Stripe onboarding link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || getBaseUrl(req);

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      return_url: `${baseUrl}/creator/creatorSettings?payout=success`,
      refresh_url: `${baseUrl}/creator/creatorSettings?payout=retry`,
      type: "account_onboarding",
    });

    // 6. Send Stripe URL back to frontend
    return NextResponse.json({ url: accountLink.url });
  } catch (err: any) {
    console.error("Stripe connect error:", err);
    return NextResponse.json(
      {
        error: "Stripe connect failed",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
