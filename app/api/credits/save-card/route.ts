import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getOrCreateStripeCustomerId } from "@/lib/stripeCustomer";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;
    if (!user?.email) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const customerId = await getOrCreateStripeCustomerId(
      stripe,
      user.id,
      user.email,
    );

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    // Create a setup-only checkout session (saves card, no charge)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "setup",
      customer: customerId,
      success_url: `${baseUrl}/credits?card_saved=true`,
      cancel_url: `${baseUrl}/credits?card_cancelled=true`,
      metadata: {
        type: "save_card",
        user_id: user.id,
      },
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create setup session";
    console.error("Save card error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
