import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { planId, name, description, price_cents } = await req.json();

    // Create Stripe product
    const product = await stripe.products.create({
      name: name,
      description: description || undefined,
      metadata: {
        plan_id: planId, // Save your plan ID in Stripe for reference
      },
    });

    // Create Stripe price (how much to charge)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: price_cents, // Price in cents (2900 = $29.00)
      currency: "usd",
      recurring: {
        interval: "month", // Charge monthly
      },
    });

    return NextResponse.json({
      success: true,
      stripe_product_id: product.id,
      stripe_price_id: price.id,
    });
  } catch (error: any) {
    console.error("Stripe product creation error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
