import { supabaseAdmin } from "@/lib/supabaseServer";
import { stripe } from "@/lib/stripe";
import nodemailer from "nodemailer";
import { createNotification } from "@/lib/notifications";
import { sendCreditTopUpEmail } from "@/lib/email";
import { syncAnnualSubscriptionCreditsByUserId } from "@/lib/creditSubscriptionSync";
import { isSuperadminUserId } from "@/lib/superadminServer";
import {
  packExpiryDays,
} from "@/lib/creditExpiry";
import { getFallbackCreditCost } from "@/lib/creditPricing";
import { buildCreditUpdate, getCreditBuckets } from "@/lib/creditBuckets";

export type CreditResult =
  | { success: true; remaining: number }
  | { success: false; error: string; required?: number; balance?: number };

/**
 * Check if user's balance has fallen below their notification threshold.
 * If so, send a low-balance email (max once per 24h).
 */
async function checkLowBalanceNotification(
  userId: string,
  newBalance: number,
): Promise<void> {
  try {
    const { data: settings } = await supabaseAdmin
      .from("balance_notification_settings")
      .select("threshold, is_enabled, last_notified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings || !settings.is_enabled || settings.threshold <= 0) return;
    if (newBalance > settings.threshold) return;

    // Don't spam — only send once per 24 hours
    if (settings.last_notified_at) {
      const lastSent = new Date(settings.last_notified_at).getTime();
      const hoursSince = (Date.now() - lastSent) / (1000 * 60 * 60);
      if (hoursSince < 24) return;
    }

    // Get user email
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!userData?.user?.email) return;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #000; color: #fff; padding: 30px; text-align: center; }
    .content { background: #fff; padding: 30px; border-left: 1px solid #e5e5e5; border-right: 1px solid #e5e5e5; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f9f9f9; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .balance { font-size: 36px; font-weight: 700; color: #ef4444; }
    .threshold { color: #666; font-size: 14px; margin-top: 5px; }
    .btn { display: inline-block; background: #ef4444; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-weight: 300; font-size: 32px;">KAIZORA</h1>
      <p style="margin: 10px 0 0; opacity: 0.8; font-size: 14px;">Low Credits Balance Alert</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; font-weight: 300;">Your credits balance is low</h2>
      <p>You set up a notification to alert you when your credits balance falls below <strong>${settings.threshold} credits</strong>.</p>
      <div class="alert-box">
        <div class="balance">${newBalance} credits</div>
        <div class="threshold">Your alert threshold: ${settings.threshold} credits</div>
      </div>
      <p>Top up your credits to continue using KAIZORA services without interruption.</p>
      <div style="text-align: center;">
        <a href="https://kaizora.primedepthlabs.com/credits" style="display: inline-block; background-color: #ef4444; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin-top: 15px;">Upgrade or Top Up</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 5px 0;">Need help? Contact us at info@KAIZORA.ai</p>
      <p style="margin: 5px 0;">&copy; ${new Date().getFullYear()} KAIZORA. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: '"KAIZORA" <info@KAIZORA.ai>',
      to: userData.user.email,
      subject: "Low Credits Balance Alert — KAIZORA",
      html: emailHtml,
      text: `Your KAIZORA credits balance is low.\n\nCurrent balance: ${newBalance} credits\nAlert threshold: ${settings.threshold} credits\n\nTop up at: https://kaizora.primedepthlabs.com/credits`,
    });

    // In-app bell notification (same 24h throttle as the email above).
    createNotification({
      user_id: userId,
      type: "low_balance",
      title: "Low credits balance",
      body: `Your balance dropped to ${newBalance.toLocaleString()} credits (alert at ${settings.threshold})`,
      link: "/pricing",
      metadata: { balance: newBalance, threshold: settings.threshold },
    });

    // Update last_notified_at
    await supabaseAdmin
      .from("balance_notification_settings")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (err) {
    console.error("Low balance notification error:", err);
  }
}

/**
 * Auto top-up: if user has auto top-up enabled and balance is below threshold,
 * charge their saved card and add credits automatically.
 */
export async function autoTopUpIfNeeded(
  userId: string,
  currentBalance: number,
): Promise<void> {
  try {
    // 1. Check if auto top-up is enabled for this user
    const { data: settings } = await supabaseAdmin
      .from("auto_topup_settings")
      .select("is_enabled, threshold, pack_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings || !settings.is_enabled || !settings.pack_id) return;
    if (currentBalance > settings.threshold) return;

    // 2. Get the credit pack details
    const { data: pack } = await supabaseAdmin
      .from("credit_packs")
      .select("id, name, price, credits, active, tier")
      .eq("id", settings.pack_id)
      .single();

    if (!pack || !pack.active) return;

    const durationDays = packExpiryDays(pack.tier);

    // 3. Get user's Stripe customer ID
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_customer_id) return;

    // 4. Get saved payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: profile.stripe_customer_id,
      type: "card",
      limit: 1,
    });

    if (!paymentMethods.data.length) return;

    const paymentMethodId = paymentMethods.data[0].id;

    // 5. Charge the saved card (off-session — no user interaction)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.price * 100, // dollars to cents
      currency: "usd",
      customer: profile.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        type: "auto_topup",
        pack_id: pack.id,
        user_id: userId,
        credits: pack.credits.toString(),
      },
    });

    if (paymentIntent.status !== "succeeded") return;

    // 6. Add credits to the permanent purchased bucket.
    const { data: currentCredits } = await supabaseAdmin
      .from("user_credits")
      .select("balance, total_purchased, subscription_credits, purchased_credits")
      .eq("user_id", userId)
      .single();

    if (!currentCredits) return;

    const buckets = getCreditBuckets(currentCredits);
    const nextPurchasedCredits = buckets.purchasedCredits + pack.credits;

    await supabaseAdmin
      .from("user_credits")
      .update({
        ...buildCreditUpdate(
          buckets.subscriptionCredits,
          nextPurchasedCredits,
        ),
        total_purchased: (currentCredits.total_purchased || 0) + pack.credits,
      })
      .eq("user_id", userId);

    // 7. Log the transaction
    await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: pack.credits,
        type: "purchase",
        action: "auto_topup",
        description: `Auto top-up: ${pack.credits} credits ($${pack.price})`,
      });

    console.log(`Auto top-up success: user ${userId} recharged ${pack.credits} credits`);

    // In-app bell notification — auto top-up completed.
    createNotification({
      user_id: userId,
      type: "credits_topped_up",
      title: "Auto top-up complete",
      body: `${pack.credits.toLocaleString()} credits were automatically added ($${pack.price})`,
      link: "/credits",
      metadata: { credits: pack.credits, price: pack.price, pack_id: pack.id },
    });

    // Email confirmation (fire-and-forget).
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userData?.user?.email) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();
        sendCreditTopUpEmail({
          to: userData.user.email,
          name: profile?.display_name || "",
          credits: pack.credits,
          amount: pack.price,
          auto: true,
          newBalance: buckets.totalBalance + pack.credits,
          durationDays,
        }).catch(() => {});
      }
    } catch {
      // ignore email failures
    }
  } catch (err: any) {
    // If card requires authentication, auto top-up can't proceed silently
    if (err.code === "authentication_required") {
      console.error(`Auto top-up failed for user ${userId}: card requires authentication`);
      createNotification({
        user_id: userId,
        type: "topup_failed",
        title: "Auto top-up failed",
        body: "Your saved card needs verification. Please top up manually.",
        link: "/pricing",
        metadata: { reason: "authentication_required" },
      });
    } else {
      console.error("Auto top-up error:", err);
      createNotification({
        user_id: userId,
        type: "topup_failed",
        title: "Auto top-up failed",
        body: "We couldn't charge your saved card. Please top up manually.",
        link: "/pricing",
        metadata: { reason: err?.code || "unknown" },
      });
    }
  }
}

/**
 * Get the credit cost for an action from the DB.
 * Returns 0 if action not found (free action).
 */
export async function getActionCost(action: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("credit_action_costs")
    .select("credits")
    .eq("action", action)
    .maybeSingle();

  if (data?.credits != null) return data.credits;

  const fallback = getFallbackCreditCost(action);
  if (fallback != null) {
    console.warn(
      `[credits] Missing credit_action_costs row for "${action}", using fallback cost ${fallback}`,
    );
    return fallback;
  }

  return 0;
}

/**
 * Get user's current credit balance.
 */
export async function getBalance(userId: string): Promise<number> {
  if (await isSuperadminUserId(userId)) {
    return Number.POSITIVE_INFINITY;
  }

  await syncAnnualSubscriptionCreditsByUserId(userId);

  const { data } = await supabaseAdmin
    .from("user_credits")
    .select("balance, subscription_credits, purchased_credits")
    .eq("user_id", userId)
    .single();

  return getCreditBuckets(data).totalBalance;
}

/**
 * Deduct credits for an action. Checks balance, deducts, logs transaction.
 * Returns success with remaining balance, or error with details.
 */
export async function deductCredits(
  userId: string,
  action: string,
  description?: string
): Promise<CreditResult> {
  if (await isSuperadminUserId(userId)) {
    return { success: true, remaining: Number.POSITIVE_INFINITY };
  }

  await syncAnnualSubscriptionCreditsByUserId(userId);

  const cost = await getActionCost(action);

  // Free action — no deduction needed
  if (cost === 0) {
    return { success: true, remaining: await getBalance(userId) };
  }

  // Get current balance
  const { data: credits, error: fetchError } = await supabaseAdmin
    .from("user_credits")
    .select("balance, total_spent, subscription_credits, purchased_credits")
    .eq("user_id", userId)
    .single();

  if (fetchError || !credits) {
    return {
      success: false,
      error: "No credits found. Please purchase credits first.",
      required: cost,
      balance: 0,
    };
  }

  const buckets = getCreditBuckets(credits);
  if (buckets.totalBalance < cost) {
    return {
      success: false,
      error: `Insufficient credits. This action costs ${cost} credits but you have ${buckets.totalBalance}.`,
      required: cost,
      balance: buckets.totalBalance,
    };
  }

  const subscriptionDebit = Math.min(buckets.subscriptionCredits, cost);
  const purchasedDebit = cost - subscriptionDebit;
  const nextSubscriptionCredits = buckets.subscriptionCredits - subscriptionDebit;
  const nextPurchasedCredits = buckets.purchasedCredits - purchasedDebit;
  const newBalance = nextSubscriptionCredits + nextPurchasedCredits;
  const newTotalSpent = (credits.total_spent || 0) + cost;

  const { error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update({
      ...buildCreditUpdate(nextSubscriptionCredits, nextPurchasedCredits),
      total_spent: newTotalSpent,
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error("Credit deduction update error:", updateError);
    return { success: false, error: "Failed to deduct credits. Please try again." };
  }

  // Log transaction
  const { error: txError } = await supabaseAdmin
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: cost,
      type: "deduction",
      action,
      description: description || `Used ${action}`,
    });

  if (txError) {
    console.error("Credit transaction log error:", txError);
  }

  // Check low balance notification + auto top-up
  checkLowBalanceNotification(userId, newBalance);
  autoTopUpIfNeeded(userId, newBalance);

  return { success: true, remaining: newBalance };
}

/**
 * Check if user has enough credits for an action (without deducting).
 * Use this BEFORE running expensive operations.
 */
export async function canAfford(
  userId: string,
  action: string
): Promise<{ affordable: boolean; cost: number; balance: number }> {
  const cost = await getActionCost(action);

  if (await isSuperadminUserId(userId)) {
    return { affordable: true, cost, balance: Number.POSITIVE_INFINITY };
  }

  if (cost === 0) {
    return { affordable: true, cost: 0, balance: await getBalance(userId) };
  }

  const balance = await getBalance(userId);
  return { affordable: balance >= cost, cost, balance };
}

/**
 * Force deduct credits AFTER a successful operation.
 * Skips the action cost lookup — you pass the cost directly.
 * Use with canAfford(): check before → run operation → forceDeduct after success.
 */
export async function forceDeduct(
  userId: string,
  cost: number,
  action: string,
  description?: string
): Promise<CreditResult> {
  if (await isSuperadminUserId(userId)) {
    return { success: true, remaining: Number.POSITIVE_INFINITY };
  }

  await syncAnnualSubscriptionCreditsByUserId(userId);

  if (cost === 0) {
    return { success: true, remaining: await getBalance(userId) };
  }

  const { data: credits, error: fetchError } = await supabaseAdmin
    .from("user_credits")
    .select("balance, total_spent, subscription_credits, purchased_credits")
    .eq("user_id", userId)
    .single();

  if (fetchError || !credits) {
    return { success: false, error: "No credits found." };
  }

  const buckets = getCreditBuckets(credits);
  if (buckets.totalBalance < cost) {
    return { success: false, error: "Insufficient credits." };
  }

  const subscriptionDebit = Math.min(buckets.subscriptionCredits, cost);
  const purchasedDebit = cost - subscriptionDebit;
  const nextSubscriptionCredits = buckets.subscriptionCredits - subscriptionDebit;
  const nextPurchasedCredits = buckets.purchasedCredits - purchasedDebit;
  const newBalance = nextSubscriptionCredits + nextPurchasedCredits;
  const newTotalSpent = (credits.total_spent || 0) + cost;

  const { error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update({
      ...buildCreditUpdate(nextSubscriptionCredits, nextPurchasedCredits),
      total_spent: newTotalSpent,
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error("Credit deduction update error:", updateError);
    return { success: false, error: "Failed to deduct credits." };
  }

  // Log transaction
  await supabaseAdmin
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: cost,
      type: "deduction",
      action,
      description: description || `Used ${action}`,
    });

  // Check low balance notification + auto top-up
  checkLowBalanceNotification(userId, newBalance);
  autoTopUpIfNeeded(userId, newBalance);

  return { success: true, remaining: newBalance };
}
