import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabaseClient";
import { isSuperadminUserId } from "@/lib/superadminServer";

export async function POST(req: NextRequest) {
  try {
    const { adminId } = await req.json();

    if (!(await isSuperadminUserId(adminId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all active plans without stripe_price_id
    const { data: plans, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .is("stripe_price_id", null);

    if (error) throw error;

    const results = [];

    for (const plan of plans || []) {
      try {
        // Skip free plans
        if (plan.price_cents === 0) {
          results.push({
            plan: plan.name,
            status: "skipped",
            reason: "Free plan - no Stripe product needed",
          });
          continue;
        }

        // Create Stripe product
        const product = await stripe.products.create({
          name: plan.name,
          description: plan.description || undefined,
          metadata: { plan_id: plan.id },
        });

        // Create Stripe price
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.price_cents,
          currency: "usd",
          recurring: { interval: "month" },
          metadata: { plan_id: plan.id },
        });

        // Update plan with stripe_price_id
        await supabase
          .from("subscription_plans")
          .update({ stripe_price_id: price.id })
          .eq("id", plan.id);

        results.push({
          plan: plan.name,
          status: "success",
          stripe_price_id: price.id,
        });
      } catch (err: any) {
        results.push({
          plan: plan.name,
          status: "failed",
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      synced: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync plans" },
      { status: 500 }
    );
  }
}
