import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Stable API version (see /api/admin/discounts).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

// True if an existing Stripe price still matches the desired amount + interval.
async function priceMatches(
  priceId: string,
  cents: number,
  interval: "month" | "year",
): Promise<boolean> {
  try {
    const p = (await stripe.prices.retrieve(priceId)) as any;
    return (
      p.active && p.unit_amount === cents && p.recurring?.interval === interval
    );
  } catch {
    return false;
  }
}

// Create/update the Stripe Product + one recurring Price for a plan.
// Each plan is a single billing interval (month or year).
async function syncPlanToStripe(plan: {
  name: string;
  description?: string | null;
  active: boolean;
  price: number;
  billing_interval: "month" | "year";
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
}) {
  const cents = Math.round(Number(plan.price) * 100);
  const interval = plan.billing_interval === "year" ? "year" : "month";

  // ── Product ──
  let productId = plan.stripe_product_id || null;
  if (productId) {
    await stripe.products.update(productId, {
      name: plan.name,
      description: plan.description || undefined,
      active: plan.active,
    });
  } else {
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
    });
    productId = product.id;
  }

  // ── Price (immutable → recreate on change) ──
  let priceId = plan.stripe_price_id || null;
  if (!priceId || !(await priceMatches(priceId, cents, interval))) {
    if (priceId) {
      try {
        await stripe.prices.update(priceId, { active: false });
      } catch {}
    }
    const p = await stripe.prices.create({
      product: productId,
      unit_amount: cents,
      currency: "usd",
      recurring: { interval },
    });
    priceId = p.id;
  }

  return { productId, priceId };
}

// GET — list plans (optionally filtered by ?interval=month|year)
export async function GET(req: NextRequest) {
  const interval = req.nextUrl.searchParams.get("interval");
  let q = supabaseAdmin
    .from("credit_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (interval === "month" || interval === "year") {
    q = q.eq("billing_interval", interval);
  }
  const { data } = await q;
  return NextResponse.json({ plans: data || [] });
}

// POST — create a plan (+ sync to Stripe)
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const billing_interval = data.billing_interval === "year" ? "year" : "month";
    const active = data.active ?? true;
    const id =
      `${(data.id || data.name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")}_${billing_interval}` ||
      `plan_${Date.now()}`;

    const { data: existingPlan } = await supabaseAdmin
      .from("credit_plans")
      .select("id, name, billing_interval")
      .eq("id", id)
      .maybeSingle();

    if (existingPlan) {
      return NextResponse.json(
        {
          error: `A ${billing_interval} plan with this name already exists. Edit the existing plan instead.`,
        },
        { status: 409 },
      );
    }

    const sync = await syncPlanToStripe({
      name: data.name,
      description: data.description,
      active,
      price: data.price || 0,
      billing_interval,
    });

    const { error } = await supabaseAdmin.from("credit_plans").insert({
      id,
      name: data.name,
      description: data.description || null,
      features: data.features || [],
      credits: data.credits || 0,
      price: data.price || 0,
      billing_interval,
      discount_percent: Number(data.discount_percent) || 0,
      stripe_product_id: sync.productId,
      stripe_price_id: sync.priceId,
      popular: data.popular || false,
      active,
      sort_order: data.sort_order || 0,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create plan" },
      { status: 400 },
    );
  }
}

// PUT — update a plan (+ re-sync to Stripe)
export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("credit_plans")
      .select("stripe_product_id, stripe_price_id, billing_interval")
      .eq("id", data.id)
      .single();

    const billing_interval =
      data.billing_interval || existing?.billing_interval || "month";
    const active = data.active ?? true;

    const sync = await syncPlanToStripe({
      name: data.name,
      description: data.description,
      active,
      price: data.price || 0,
      billing_interval,
      stripe_product_id: existing?.stripe_product_id,
      stripe_price_id: existing?.stripe_price_id,
    });

    const { error } = await supabaseAdmin
      .from("credit_plans")
      .update({
        name: data.name,
        description: data.description || null,
        features: data.features || [],
        credits: data.credits || 0,
        price: data.price || 0,
        billing_interval,
        discount_percent: Number(data.discount_percent) || 0,
        stripe_product_id: sync.productId,
        stripe_price_id: sync.priceId,
        popular: data.popular || false,
        active,
        sort_order: data.sort_order || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update plan" },
      { status: 400 },
    );
  }
}

// DELETE — remove a plan (archive its Stripe product)
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("credit_plans")
      .select("stripe_product_id")
      .eq("id", id)
      .single();

    if (existing?.stripe_product_id) {
      try {
        await stripe.products.update(existing.stripe_product_id, {
          active: false,
        });
      } catch {}
    }

    await supabaseAdmin.from("credit_plans").delete().eq("id", id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete plan" },
      { status: 400 },
    );
  }
}
