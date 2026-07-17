import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fulfillAssetPurchase } from "@/lib/fulfillPurchase";
import { createNotification } from "@/lib/notifications";
import {
  sendCreditTopUpEmail,
  sendSubscriptionEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
} from "@/lib/email";
import {
  syncAnnualSubscriptionCreditsForRow,
  applyPendingPlanChangeIfDue,
} from "@/lib/creditSubscriptionSync";
import {
  buildCreditUpdate,
  getCreditBuckets,
  getPlanMonthlyCredits,
} from "@/lib/creditBuckets";

// Look up a user's email + display name for notification emails.
async function getUserContact(
  userId: string,
): Promise<{ email: string | null; name: string }> {
  try {
    const [{ data: authData }, { data: profile }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    return {
      email: authData?.user?.email || null,
      name: profile?.display_name || "",
    };
  } catch {
    return { email: null, name: "" };
  }
}

function toIsoFromUnix(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  try {
    return new Date(value * 1000).toISOString();
  } catch {
    return null;
  }
}

async function logWebhookEvent(
  eventType: string,
  eventId: string,
  status: "success" | "failed",
  payload?: any,
  errorMessage?: string,
) {
  try {
    await supabaseAdmin.from("webhook_logs").insert({
      event_type: eventType,
      event_id: eventId,
      status,
      payload: payload || null,
      error_message: errorMessage || null,
    });
  } catch (error) {
    console.error("Failed to log webhook event:", error);
  }
}

function getSubscriptionPeriodEnd(subscription: any): string | null {
  const topLevelPeriodEnd = toIsoFromUnix(subscription?.current_period_end);
  if (topLevelPeriodEnd) return topLevelPeriodEnd;

  const itemPeriodEnds = (subscription?.items?.data || [])
    .map((item: any) => item?.current_period_end)
    .filter((value: unknown) => typeof value === "number" && Number.isFinite(value));

  if (!itemPeriodEnds.length) return null;
  return toIsoFromUnix(Math.max(...itemPeriodEnds));
}

function getInvoiceSubscriptionId(invoice: any): string | null {
  if (typeof invoice?.subscription === "string" && invoice.subscription) {
    return invoice.subscription;
  }

  if (
    invoice?.parent?.type === "subscription_details" &&
    typeof invoice?.parent?.subscription_details?.subscription === "string"
  ) {
    return invoice.parent.subscription_details.subscription;
  }

  return null;
}

async function isCreditSubscription(subscriptionId: string, metadata?: any) {
  if (metadata?.type === "credit_subscription") return true;

  const { data } = await supabaseAdmin
    .from("user_credit_subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  return !!data;
}

async function getCreditPlanByStripePriceId(stripePriceId?: string | null) {
  if (!stripePriceId) return null;

  const { data } = await supabaseAdmin
    .from("credit_plans")
    .select("id, credits, billing_interval")
    .eq("stripe_price_id", stripePriceId)
    .maybeSingle();

  return data;
}

async function isCreditSubscriptionObject(subscription: any) {
  if (await isCreditSubscription(subscription.id, subscription.metadata)) {
    return true;
  }

  const stripePriceId = subscription.items?.data?.[0]?.price?.id;
  const plan = await getCreditPlanByStripePriceId(stripePriceId);
  return !!plan;
}

async function upsertCreditSubscription(subscription: any) {
  const metadata = subscription.metadata || {};
  let userId = metadata.user_id;
  let planId = metadata.plan_id;
  const stripePriceId = subscription.items?.data?.[0]?.price?.id;
  const planFromPrice = await getCreditPlanByStripePriceId(stripePriceId);
  let existingSubscription: {
    user_id?: string | null;
    plan_id?: string | null;
    pending_plan_id?: string | null;
    pending_change_effective_date?: string | null;
  } | null = null;

  if (!userId || !planId) {
    const { data: existing } = await supabaseAdmin
      .from("user_credit_subscriptions")
      .select("user_id, plan_id, pending_plan_id, pending_change_effective_date")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    existingSubscription = existing;
    userId = userId || existing?.user_id;
    planId = planId || existing?.plan_id;
  } else {
    const { data: existing } = await supabaseAdmin
      .from("user_credit_subscriptions")
      .select("user_id, plan_id, pending_plan_id, pending_change_effective_date")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    existingSubscription = existing;
  }

  if (!userId && subscription.customer) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", subscription.customer)
      .maybeSingle();

    userId = profile?.id || null;
  }

  if (!planId && planFromPrice) {
    planId = planFromPrice.id;
  }

  if (!userId || !planId) {
    throw new Error(
      `Credit subscription ${subscription.id} is missing user_id or plan_id metadata`,
    );
  }

  const billingInterval =
    subscription.items?.data?.[0]?.price?.recurring?.interval ||
    metadata.billing_interval ||
    planFromPrice?.billing_interval ||
    "month";
  const creditsPerCycle = Number(metadata.credits) || planFromPrice?.credits || 0;
  const periodEnd = getSubscriptionPeriodEnd(subscription);
  const pendingEffectiveDate = existingSubscription?.pending_change_effective_date
    ? new Date(existingSubscription.pending_change_effective_date)
    : null;
  const pendingDowngradeStillDeferred =
    existingSubscription?.pending_plan_id &&
    pendingEffectiveDate &&
    !Number.isNaN(pendingEffectiveDate.getTime()) &&
    pendingEffectiveDate.getTime() > Date.now() &&
    planId === existingSubscription.pending_plan_id;
  const effectivePlanId = pendingDowngradeStillDeferred
    ? existingSubscription?.plan_id || planId
    : planId;

  console.log("[stripe webhook] upsert credit subscription", {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    stripePriceId,
    userId,
    planId: effectivePlanId,
    billingInterval,
    creditsPerCycle,
    periodEnd,
    status: subscription.status,
  });

  await supabaseAdmin.from("user_credit_subscriptions").upsert(
    {
      user_id: userId,
      plan_id: effectivePlanId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer || null,
      status: subscription.status || "active",
      billing_interval: billingInterval,
      credits_per_cycle: creditsPerCycle,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      pending_plan_id: pendingDowngradeStillDeferred
        ? existingSubscription?.pending_plan_id || null
        : null,
      pending_change_effective_date: pendingDowngradeStillDeferred
        ? existingSubscription?.pending_change_effective_date || null
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  return {
    userId,
    planId: effectivePlanId,
    billingInterval,
    creditsPerCycle,
    previousPlanId: existingSubscription?.plan_id || null,
    currentPeriodEnd: periodEnd,
  };
}

async function grantImmediateUpgradeCredits(params: {
  userId: string;
  subscriptionId: string;
  previousPlanId: string | null;
  nextPlanId: string;
  nextPlanCredits: number;
  currentPeriodEnd: string | null;
}) {
  const previousPlanCredits = getPlanMonthlyCredits(params.previousPlanId);
  const nextPlanCredits = getPlanMonthlyCredits(
    params.nextPlanId,
    params.nextPlanCredits,
  );

  if (
    !params.previousPlanId ||
    previousPlanCredits <= 0 ||
    nextPlanCredits <= previousPlanCredits
  ) {
    return { granted: false, reason: "not_upgrade" as const };
  }

  const marker = `subupgrade:${params.subscriptionId}:${params.nextPlanId}:${params.currentPeriodEnd || "none"}`;
  const { data: existingTx } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("stripe_session_id", marker)
    .maybeSingle();

  if (existingTx) {
    return { granted: false, reason: "already_granted" as const };
  }

  const { data: creditsRow } = await supabaseAdmin
    .from("user_credits")
    .select("subscription_credits, purchased_credits, balance")
    .eq("user_id", params.userId)
    .maybeSingle();

  const buckets = getCreditBuckets(creditsRow);
  const nextSubscriptionCredits = buckets.subscriptionCredits + nextPlanCredits;

  if (creditsRow) {
    await supabaseAdmin
      .from("user_credits")
      .update(
        buildCreditUpdate(nextSubscriptionCredits, buckets.purchasedCredits),
      )
      .eq("user_id", params.userId);
  } else {
    await supabaseAdmin.from("user_credits").insert({
      user_id: params.userId,
      ...buildCreditUpdate(nextSubscriptionCredits, 0),
      total_purchased: 0,
      total_spent: 0,
    });
  }

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: params.userId,
    amount: nextPlanCredits,
    type: "purchase",
    action: "subscription_upgrade",
    description: `Upgraded from ${params.previousPlanId} to ${params.nextPlanId}`,
    stripe_session_id: marker,
  });

  return {
    granted: true,
    reason: "upgrade_applied" as const,
    newSubscriptionCredits: nextSubscriptionCredits,
  };
}

async function grantCreditsForSubscriptionInvoice(invoice: any, subscription: any) {
  const {
    userId,
    planId,
    billingInterval,
    creditsPerCycle,
    previousPlanId,
  } =
    await upsertCreditSubscription(subscription);
  const periodEnd = getSubscriptionPeriodEnd(subscription);
  const billingReason = invoice.billing_reason;

  console.log("[stripe webhook] grant subscription credits start", {
    invoiceId: invoice.id,
    subscriptionId: subscription.id,
    billingReason: invoice.billing_reason,
    userId,
    planId,
    billingInterval,
    creditsPerCycle,
    periodEnd,
  });

  if (!periodEnd || creditsPerCycle <= 0) {
    throw new Error(
      `Credit subscription ${subscription.id} missing period end or credits`,
    );
  }

  if (billingReason === "subscription_update") {
    await grantImmediateUpgradeCredits({
      userId,
      subscriptionId: subscription.id,
      previousPlanId,
      nextPlanId: planId,
      nextPlanCredits: creditsPerCycle,
      currentPeriodEnd: periodEnd,
    });

    return { userId, planId, credits: creditsPerCycle, alreadyGranted: false };
  }

  const { data: refreshedRow } = await supabaseAdmin
    .from("user_credit_subscriptions")
    .select(
      "user_id, plan_id, stripe_subscription_id, status, billing_interval, credits_per_cycle, current_period_end, cancel_at_period_end, pending_plan_id, pending_change_effective_date",
    )
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (refreshedRow) {
    await applyPendingPlanChangeIfDue(refreshedRow as any);
  }

  if (billingInterval === "year") {
    const syncResult = await syncAnnualSubscriptionCreditsForRow({
      user_id: userId,
      plan_id: planId,
      stripe_subscription_id: subscription.id,
      status: subscription.status || "active",
      billing_interval: "year",
      credits_per_cycle: creditsPerCycle,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
    });

    if (!syncResult.synced) {
      console.log("[stripe webhook] annual subscription credits already current", {
        invoiceId: invoice.id,
        subscriptionId: subscription.id,
        reason: syncResult.reason,
      });
      return { userId, planId, credits: creditsPerCycle, alreadyGranted: true };
    }

    const isInitial = invoice.billing_reason === "subscription_create";

    createNotification({
      user_id: userId,
      type: isInitial ? "subscription_started" : "subscription_renewed",
      title: isInitial ? "Subscription activated" : "Subscription renewed",
      body: `${creditsPerCycle.toLocaleString()} credits were added to your balance`,
      link: "/credits",
      metadata: {
        credits: creditsPerCycle,
        plan_id: planId,
        billing_interval: billingInterval,
        invoice_id: invoice.id,
      },
    });

    const { data: planRow } = await supabaseAdmin
      .from("credit_plans")
      .select("name, price")
      .eq("id", planId)
      .maybeSingle();
    const contact = await getUserContact(userId);
    if (contact.email) {
      sendSubscriptionEmail({
        to: contact.email,
        name: contact.name,
        planName: planRow?.name || `${planId}`,
        credits: creditsPerCycle,
        billingInterval: "year",
        amount: planRow?.price ?? null,
        renewal: !isInitial,
      }).catch(() => {});
    }

    return { userId, planId, credits: creditsPerCycle, alreadyGranted: false };
  }

  const txMarker = `subinv:${invoice.id}`;
  const { data: existingTx } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("stripe_session_id", txMarker)
    .maybeSingle();

  if (existingTx) {
    console.log("[stripe webhook] subscription credits already granted", {
      invoiceId: invoice.id,
      subscriptionId: subscription.id,
      txMarker,
    });
    return { userId, planId, credits: creditsPerCycle, alreadyGranted: true };
  }

  const { data: existingCredits } = await supabaseAdmin
    .from("user_credits")
    .select("balance, total_purchased, subscription_credits, purchased_credits")
    .eq("user_id", userId)
    .maybeSingle();

  const buckets = getCreditBuckets(existingCredits);
  if (existingCredits) {
    await supabaseAdmin
      .from("user_credits")
      .update({
        ...buildCreditUpdate(creditsPerCycle, buckets.purchasedCredits),
      })
      .eq("user_id", userId);
  } else {
    await supabaseAdmin.from("user_credits").insert({
      user_id: userId,
      ...buildCreditUpdate(creditsPerCycle, 0),
      total_purchased: 0,
      total_spent: 0,
    });
  }

  const isInitial = invoice.billing_reason === "subscription_create";

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount: creditsPerCycle,
    type: "purchase",
    action: isInitial ? "subscription_start" : "subscription_renewal",
    description: `${isInitial ? "Started" : "Renewed"} ${planId} ${billingInterval} subscription`,
    stripe_session_id: txMarker,
  });

  createNotification({
    user_id: userId,
    type: isInitial ? "subscription_started" : "subscription_renewed",
    title: isInitial ? "Subscription activated" : "Subscription renewed",
    body: `${creditsPerCycle.toLocaleString()} credits were added to your balance`,
    link: "/credits",
    metadata: {
      credits: creditsPerCycle,
      plan_id: planId,
      billing_interval: billingInterval,
      invoice_id: invoice.id,
    },
  });

  // Email confirmation (fire-and-forget).
  const { data: planRow } = await supabaseAdmin
    .from("credit_plans")
    .select("name, price")
    .eq("id", planId)
    .maybeSingle();
  const contact = await getUserContact(userId);
  if (contact.email) {
    sendSubscriptionEmail({
      to: contact.email,
      name: contact.name,
      planName: planRow?.name || `${planId}`,
      credits: creditsPerCycle,
      billingInterval: billingInterval === "year" ? "year" : "month",
      amount: planRow?.price ?? null,
      renewal: !isInitial,
    }).catch(() => {});
  }

  console.log("[stripe webhook] subscription credits granted", {
    invoiceId: invoice.id,
    subscriptionId: subscription.id,
    userId,
    planId,
    creditsPerCycle,
  });

  return { userId, planId, credits: creditsPerCycle, alreadyGranted: false };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  try {
    await supabaseAdmin.from("webhook_logs").insert({
      event_type: "webhook.received",
      event_id: `raw_${Date.now()}`,
      status: signature ? "success" : "failed",
      payload: {
        has_signature: !!signature,
        body_length: body.length,
      },
      error_message: signature ? null : "No signature header",
    });
  } catch (error) {
    console.error("Failed to write raw webhook receipt log:", error);
  }

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: any;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await supabaseAdmin.from("webhook_logs").insert({
      event_type: "webhook.parsed",
      event_id: event.id,
      status: "success",
      payload: {
        parsed_type: event.type,
      },
      error_message: null,
    });
  } catch (error) {
    console.error("Failed to write parsed webhook log:", error);
  }

  console.log("Webhook:", event.type, event.id);

  try {
    const eventType = event.type;
    const eventId = event.id;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;

        if (session.metadata?.type === "credits") {
          const userId = session.metadata.user_id;
          const credits = parseInt(session.metadata.credits, 10);
          const packId = session.metadata.pack_id;

          if (userId && credits > 0) {
            const { data: existing } = await supabaseAdmin
              .from("user_credits")
              .select(
                "balance, total_purchased, subscription_credits, purchased_credits",
              )
              .eq("user_id", userId)
              .maybeSingle();

            if (existing) {
              const buckets = getCreditBuckets(existing);
              await supabaseAdmin
                .from("user_credits")
                .update({
                  ...buildCreditUpdate(
                    buckets.subscriptionCredits,
                    buckets.purchasedCredits + credits,
                  ),
                  total_purchased: (existing.total_purchased || 0) + credits,
                })
                .eq("user_id", userId);
            } else {
              await supabaseAdmin.from("user_credits").insert({
                user_id: userId,
                ...buildCreditUpdate(0, credits),
                total_purchased: credits,
                total_spent: 0,
              });
            }

            const { error: txError } = await supabaseAdmin
              .from("credit_transactions")
              .insert({
                user_id: userId,
                amount: credits,
                type: "purchase",
                action: "credit_purchase",
                description: `Purchased ${packId} pack`,
                stripe_session_id: session.id,
              });

            if (txError) {
              console.error("credit_transactions insert error:", txError);
            }

            createNotification({
              user_id: userId,
              type: "credits_purchased",
              title: "Credits added",
              body: `${credits.toLocaleString()} credits were added to your balance`,
              link: "/credits",
              metadata: { credits, pack_id: packId },
            });

            const contact = await getUserContact(userId);
            if (contact.email) {
              sendCreditTopUpEmail({
                to: contact.email,
                name: contact.name,
                credits,
                amount: (session.amount_total || 0) / 100,
                auto: false,
                durationDays: parseInt(session.metadata.duration_days, 10) || 30,
              }).catch(() => {});
            }

            await logWebhookEvent(eventType, eventId, "success", {
              userId,
              packId,
              credits,
            });
          }
          break;
        }

        if (
          session.metadata?.type === "credit_subscription" &&
          session.subscription
        ) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          const info = await upsertCreditSubscription(subscription);

          await logWebhookEvent(eventType, eventId, "success", {
            userId: info.userId,
            planId: info.planId,
            subscriptionId: subscription.id,
            mode: "credit_subscription_checkout_completed",
          });
          break;
        }

        const planId = session.metadata?.plan_id;
        const userId = session.metadata?.user_id;

        if (planId && userId) {
          await supabaseAdmin.from("user_subscriptions").upsert({
            user_id: userId,
            plan_id: planId,
            stripe_subscription_id: session.subscription,
            stripe_customer_id: session.customer,
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            updated_at: new Date().toISOString(),
          });

          await logWebhookEvent(eventType, eventId, "success", {
            userId,
            planId,
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as any;
        if (pi.metadata?.kind === "asset_purchase") {
          const result = await fulfillAssetPurchase(pi.id, req.nextUrl.origin);
          console.log("Asset purchase fulfilled:", pi.id, result);
        }
        await logWebhookEvent(eventType, eventId, "success", { piId: pi.id });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        console.log("[stripe webhook] customer.subscription.updated", {
          subscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          stripePriceId: subscription.items?.data?.[0]?.price?.id,
          metadata: subscription.metadata,
        });

        if (await isCreditSubscriptionObject(subscription)) {
          const info = await upsertCreditSubscription(subscription);
          await grantImmediateUpgradeCredits({
            userId: info.userId,
            subscriptionId: subscription.id,
            previousPlanId: info.previousPlanId,
            nextPlanId: info.planId,
            nextPlanCredits: info.creditsPerCycle,
            currentPeriodEnd: info.currentPeriodEnd || null,
          });

          await logWebhookEvent(eventType, eventId, "success", {
            userId: info.userId,
            planId: info.planId,
            subscriptionId: subscription.id,
            mode: "credit_subscription_updated",
          });
          break;
        }

        await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: subscription.status,
            current_period_start:
              toIsoFromUnix(subscription.current_period_start) ||
              new Date().toISOString(),
            current_period_end: toIsoFromUnix(subscription.current_period_end),
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        await logWebhookEvent(eventType, eventId, "success", {
          subscriptionId: subscription.id,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;

        if (await isCreditSubscriptionObject(subscription)) {
          const { data: subRow } = await supabaseAdmin
            .from("user_credit_subscriptions")
            .select("user_id, plan_id")
            .eq("stripe_subscription_id", subscription.id)
            .maybeSingle();

          await supabaseAdmin
            .from("user_credit_subscriptions")
            .update({
              status: "canceled",
              cancel_at_period_end: false,
              pending_plan_id: null,
              pending_change_effective_date: null,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscription.id);

          if (subRow?.user_id) {
            await supabaseAdmin
              .from("user_credits")
              .update(buildCreditUpdate(0, 0))
              .eq("user_id", subRow.user_id);
          }

          if (subRow?.user_id) {
            const { data: planRow } = await supabaseAdmin
              .from("credit_plans")
              .select("name")
              .eq("id", subRow.plan_id)
              .maybeSingle();
            createNotification({
              user_id: subRow.user_id,
              type: "subscription_cancelled",
              title: "Subscription cancelled",
              body: `Your ${planRow?.name || "subscription"} has ended.`,
              link: "/pricing",
              metadata: { plan_id: subRow.plan_id },
            });
            const contact = await getUserContact(subRow.user_id);
            if (contact.email) {
              sendSubscriptionCancelledEmail({
                to: contact.email,
                name: contact.name,
                planName: planRow?.name || "your plan",
                immediate: true,
              }).catch(() => {});
            }
          }

          await logWebhookEvent(eventType, eventId, "success", {
            subscriptionId: subscription.id,
            mode: "credit_subscription_deleted",
          });
          break;
        }

        await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        await logWebhookEvent(eventType, eventId, "success", {
          subscriptionId: subscription.id,
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        console.log("[stripe webhook] invoice.payment_succeeded", {
          invoiceId: invoice.id,
          subscriptionId,
          billingReason: invoice.billing_reason,
        });

        if (subscriptionId) {
          const subscriptionData = await stripe.subscriptions.retrieve(
            subscriptionId,
          );
          const sub = subscriptionData as any;

          if (await isCreditSubscriptionObject(sub)) {
            const grant = await grantCreditsForSubscriptionInvoice(invoice, sub);

            await logWebhookEvent(eventType, eventId, "success", {
              invoiceId: invoice.id,
              subscriptionId: sub.id,
              userId: grant.userId,
              planId: grant.planId,
              credits: grant.credits,
              alreadyGranted: grant.alreadyGranted,
              mode: "credit_subscription_invoice_paid",
            });
            break;
          }

          await supabaseAdmin
            .from("user_subscriptions")
            .update({
              status: "active",
              current_period_start:
                toIsoFromUnix(sub.current_period_start) ||
                new Date().toISOString(),
              current_period_end: toIsoFromUnix(sub.current_period_end),
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscriptionData.id);

          await logWebhookEvent(eventType, eventId, "success", {
            invoiceId: invoice.id,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId,
          );

          if (await isCreditSubscriptionObject(subscription)) {
            const { data: subRow } = await supabaseAdmin
              .from("user_credit_subscriptions")
              .select("user_id, plan_id")
              .eq("stripe_subscription_id", subscription.id)
              .maybeSingle();

            await supabaseAdmin
              .from("user_credit_subscriptions")
              .update({
                status: "past_due",
                updated_at: new Date().toISOString(),
              })
              .eq("stripe_subscription_id", subscription.id);

            if (subRow?.user_id) {
              const { data: planRow } = await supabaseAdmin
                .from("credit_plans")
                .select("name")
                .eq("id", subRow.plan_id)
                .maybeSingle();
              createNotification({
                user_id: subRow.user_id,
                type: "payment_failed",
                title: "Payment failed",
                body: "We couldn't charge your card. Update your payment method to keep your subscription.",
                link: "/credits",
                metadata: { plan_id: subRow.plan_id },
              });
              const contact = await getUserContact(subRow.user_id);
              if (contact.email) {
                sendPaymentFailedEmail({
                  to: contact.email,
                  name: contact.name,
                  planName: planRow?.name || "your plan",
                }).catch(() => {});
              }
            }

            await logWebhookEvent(eventType, eventId, "success", {
              invoiceId: invoice.id,
              subscriptionId: subscription.id,
              reason: "payment_failed",
              mode: "credit_subscription_invoice_failed",
            });
            break;
          }

          await supabaseAdmin
            .from("user_subscriptions")
            .update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscriptionId);

          await logWebhookEvent(eventType, eventId, "success", {
            invoiceId: invoice.id,
            reason: "payment_failed",
          });
        }
        break;
      }

      default:
        await logWebhookEvent(eventType, eventId, "success", {
          message: "Unhandled event type",
        });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);

    await logWebhookEvent(
      event.type,
      event.id,
      "failed",
      null,
      error.message || "Unknown error",
    );

    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
