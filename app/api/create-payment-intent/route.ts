import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getPlatformFeePercent } from "@/app/api/admin/platform-fee/route";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  console.log("🔑 Full secret key:", process.env.STRIPE_SECRET_KEY);

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        {
          error: "Stripe key not configured",
        },
        { status: 500 },
      );
    }

    console.log("Secret Key loaded:", secretKey.substring(0, 20) + "...");

    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-12-15.clover" as any, //2025-12-15.clover
      maxNetworkRetries: 2,
      timeout: 20000,
    });
    const { amount, userId, items } = await req.json();
    console.log("Amount to charge:", amount);
    console.log("User ID:", userId);
    console.log("Items:", items);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      // Tag the intent so the webhook knows this is a marketplace asset
      // purchase (vs. a credit pack / subscription).
      metadata: {
        kind: "asset_purchase",
        userId: userId || "",
      },
    });
    console.log("SUCCESS: Payment intent created");

    // 🚀 Store transactions in database — use dynamic platform fee
    const feePercent = await getPlatformFeePercent();
    if (items && items.length > 0 && userId) {
      for (const item of items) {
        const { error: txError } = await supabase.from("transactions").insert({
          buyer_id: userId,
          creator_id: item.seller_id,
          asset_id: item.asset_id,
          license_type_id:
            item.license?.license_type?.id || item.license?.id || null,
          listing_id:
            item.listing_id && item.listing_id !== item.asset_id
              ? item.listing_id
              : null,
          stripe_payment_intent_id: paymentIntent.id,
          amount_cents: item.price_cents,
          platform_fee_cents: Math.floor((item.price_cents * feePercent) / 100),
          currency: "usd",
          status: "pending",
        });

        if (txError) {
          console.error("Transaction insert error:", txError);
        }
      }
      console.log("✅ Transactions stored in database");
    }

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    // Log the FULL error details
    console.error("=== FULL STRIPE ERROR ===");
    console.error("Message:", error.message);
    console.error("Type:", error.type);
    console.error("Code:", error.code);
    console.error("Full Error:", JSON.stringify(error, null, 2));
    console.error("========================");

    return NextResponse.json(
      {
        error: error.message || "Payment failed",
      },
      { status: 500 },
    );
  }
}
