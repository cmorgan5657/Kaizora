import nodemailer from "nodemailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kaizora.com";
const FROM = `"KAIZORA" <${process.env.SMTP_USER || "info@KAIZORA.ai"}>`;
const BILLING_FROM = `"KAIZORA" <${process.env.BILLING_FROM_EMAIL || "billing@kaizora.ai"}>`;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─────────────────────────────────────────────────────────────
// Shared layout helpers
// ─────────────────────────────────────────────────────────────

function layout(opts: {
  subtitle: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f9f9f9; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #000; color: #fff; padding: 30px; text-align: center; }
    .content { background: #fff; padding: 30px; border-left: 1px solid #e5e5e5; border-right: 1px solid #e5e5e5; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f9f9f9; border-top: 1px solid #e5e5e5; }
    .alert { background: #fff5f5; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; }
    .info { background: #f5f7ff; border-left: 4px solid #4f46e5; padding: 16px; margin: 20px 0; }
    .success { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; }
    .detail-row { padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; }
    .label { font-weight: 600; color: #666; }
    .value { color: #000; }
    a.btn { display: inline-block; background: #000; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 4px; margin-top: 16px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;font-weight:300;font-size:28px;letter-spacing:4px;">KAIZORA</h1>
      <p style="margin:8px 0 0;opacity:0.7;font-size:13px;">${opts.subtitle}</p>
    </div>
    <div class="content">
      ${opts.bodyHtml}
    </div>
    <div class="footer">
      <p style="margin:5px 0;">Need help? Contact us at info@KAIZORA.ai</p>
      <p style="margin:5px 0;">© ${new Date().getFullYear()} KAIZORA. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function safeSend(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}): Promise<void> {
  if (!opts.to) {
    console.warn("[email] skipped — no recipient", opts.subject);
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: opts.from || FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[email] sent "${opts.subject}" → ${opts.to} (${info.messageId})`);
  } catch (err) {
    console.error(`[email] failed "${opts.subject}" → ${opts.to}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────
// 1) Content flagged (hidden pending admin review)
// ─────────────────────────────────────────────────────────────

export async function sendContentFlaggedEmail(params: {
  to: string;
  assetTitle: string;
  source: "ai_scan" | "user_report";
  reason: string;
}): Promise<void> {
  const { to, assetTitle, source, reason } = params;
  const sourceLabel =
    source === "ai_scan" ? "Automated AI content scan" : "User report";

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">Your asset has been flagged for review</h2>
    <p style="color:#666;font-size:14px;">An issue has been raised against one of your assets on KAIZORA. The asset is temporarily hidden from the marketplace while our team reviews it.</p>

    <div class="alert">
      <strong style="font-size:14px;">Asset:</strong>
      <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(assetTitle)}</p>
    </div>

    <div style="margin:20px 0;">
      <p style="font-size:14px;color:#333;"><strong>Source:</strong></p>
      <p style="font-size:14px;color:#555;">${escapeHtml(sourceLabel)}</p>
    </div>

    <div style="margin:20px 0;">
      <p style="font-size:14px;color:#333;"><strong>Reason:</strong></p>
      <p style="font-size:14px;color:#555;">${escapeHtml(reason)}</p>
    </div>

    <p style="font-size:14px;color:#666;margin-top:24px;">Our review team will assess the report and notify you of the outcome. No further action is required from you at this stage.</p>
    <p style="font-size:14px;color:#666;">Please review our <a href="${SITE_URL}/terms" style="color:#4f46e5;">Terms of Service</a> and content guidelines.</p>
  `;

  await safeSend({
    to,
    subject: "Your asset has been flagged for review",
    html: layout({ subtitle: "Content Review Notice", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 2) Content removed (admin takedown)
// ─────────────────────────────────────────────────────────────

export async function sendContentRemovedEmail(params: {
  to: string;
  assetTitle: string;
  reason: string;
  adminNote?: string;
}): Promise<void> {
  const { to, assetTitle, reason, adminNote } = params;

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">Asset Removed from Marketplace</h2>
    <p style="color:#666;font-size:14px;">Your asset has been removed from the Kaizora marketplace after a review by our team.</p>

    <div class="alert">
      <strong style="font-size:14px;">Asset:</strong>
      <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(assetTitle)}</p>
    </div>

    <div style="margin:20px 0;">
      <p style="font-size:14px;color:#333;"><strong>Reason for removal:</strong></p>
      <p style="font-size:14px;color:#555;">${escapeHtml(reason)}</p>
    </div>

    ${
      adminNote
        ? `<div style="margin:20px 0;">
            <p style="font-size:14px;color:#333;"><strong>Note from review team:</strong></p>
            <p style="font-size:14px;color:#555;">${escapeHtml(adminNote)}</p>
          </div>`
        : ""
    }

    <p style="font-size:14px;color:#666;margin-top:24px;">If you believe this was a mistake or want to appeal this decision, please contact our support team by replying to this email.</p>
    <p style="font-size:14px;color:#666;">Please review our <a href="${SITE_URL}/terms" style="color:#ef4444;">Terms of Service</a> and <a href="${SITE_URL}/dmca-policy" style="color:#ef4444;">Content Policy</a> before re-uploading.</p>
  `;

  await safeSend({
    to,
    subject: `Important: Your asset "${assetTitle}" has been removed`,
    html: layout({ subtitle: "Content Policy Notice", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 3) Auto-blocked by AI (high severity)
// ─────────────────────────────────────────────────────────────

export type ModerationCategories = {
  nudity?: number;
  violence?: number;
  explicit_content?: number;
  hate_speech?: number;
};

export async function sendContentAutoBlockedEmail(params: {
  to: string;
  assetTitle: string;
  categories: ModerationCategories;
}): Promise<void> {
  const { to, assetTitle, categories } = params;

  const entries = Object.entries(categories || {}) as [
    keyof ModerationCategories,
    number | undefined
  ][];
  const top = entries
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];

  const labelMap: Record<string, string> = {
    nudity: "Nudity",
    violence: "Violence",
    explicit_content: "Explicit content",
    hate_speech: "Hate speech",
  };

  const topLabel = top ? labelMap[top[0]] || top[0] : "Policy violation";
  const topScore = top ? Math.round((top[1] || 0) * 100) : 0;

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">Your upload was blocked</h2>
    <p style="color:#666;font-size:14px;">Our automated content moderation detected high-risk content in your upload. The asset has been blocked and is not visible on the marketplace.</p>

    <div class="alert">
      <strong style="font-size:14px;">Asset:</strong>
      <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(assetTitle)}</p>
    </div>

    <div style="margin:20px 0;">
      <p style="font-size:14px;color:#333;"><strong>Top detected category:</strong></p>
      <p style="font-size:14px;color:#555;">${escapeHtml(topLabel)} — confidence ${topScore}%</p>
    </div>

    <p style="font-size:14px;color:#666;margin-top:24px;">Please review our content guidelines before re-uploading. Repeated violations may result in account restrictions.</p>
    <p style="font-size:14px;color:#666;"><a href="${SITE_URL}/terms" style="color:#ef4444;">Terms of Service</a> · <a href="${SITE_URL}/dmca-policy" style="color:#ef4444;">Content Policy</a></p>
  `;

  await safeSend({
    to,
    subject: "Your upload was blocked",
    html: layout({ subtitle: "Automated Content Block", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 4) New sale notification (to seller)
// ─────────────────────────────────────────────────────────────

export async function sendNewSaleEmail(params: {
  to: string;
  sellerName: string;
  assetTitle: string;
  buyerName: string;
  priceCents: number;
  licenseType: string;
}): Promise<void> {
  const { to, sellerName, assetTitle, buyerName, priceCents, licenseType } =
    params;

  const price = `$${(priceCents / 100).toFixed(2)} USD`;

  const body = `
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">🎉 You made a sale!</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(sellerName || "there")}, congratulations — someone just licensed your work on KAIZORA.</p>

    <div class="success">
      <strong style="font-size:14px;">${escapeHtml(assetTitle)}</strong>
      <p style="margin:4px 0 0;font-size:13px;color:#444;">licensed for <strong>${price}</strong></p>
    </div>

    <div style="margin: 24px 0;">
      <div class="detail-row">
        <span class="label">Asset</span>
        <span class="value">${escapeHtml(assetTitle)}</span>
      </div>
      <div class="detail-row">
        <span class="label">Buyer</span>
        <span class="value">${escapeHtml(buyerName || "A KAIZORA user")}</span>
      </div>
      <div class="detail-row">
        <span class="label">License</span>
        <span class="value">${escapeHtml(licenseType)}</span>
      </div>
      <div class="detail-row" style="border:none;">
        <span class="label">Amount</span>
        <span class="value" style="font-size:18px;font-weight:600;">${price}</span>
      </div>
    </div>

    <p style="font-size:14px;color:#666;">Earnings will be reflected in your seller dashboard shortly.</p>
    <p><a class="btn" href="${SITE_URL}/dashboard/earnings">View earnings</a></p>
  `;

  await safeSend({
    to,
    subject: "🎉 You made a sale on KAIZORA",
    html: layout({ subtitle: "New Sale", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 4b) New purchase confirmation (to buyer)
// ─────────────────────────────────────────────────────────────

export async function sendPurchaseConfirmedEmail(params: {
  to: string;
  buyerName: string;
  assetTitle: string;
  sellerName: string;
  priceCents: number;
  licenseType: string;
}): Promise<void> {
  const { to, buyerName, assetTitle, sellerName, priceCents, licenseType } = params;
  const price = `$${(priceCents / 100).toFixed(2)} USD`;

  const body = `
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">✅ Purchase confirmed</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(buyerName || "there")}, thanks for your purchase. Your new license is ready in your library.</p>

    <div class="success">
      <strong style="font-size:14px;">${escapeHtml(assetTitle)}</strong>
      <p style="margin:4px 0 0;font-size:13px;color:#444;">licensed for <strong>${price}</strong></p>
    </div>

    <div style="margin: 24px 0;">
      <div class="detail-row">
        <span class="label">Asset</span>
        <span class="value">${escapeHtml(assetTitle)}</span>
      </div>
      <div class="detail-row">
        <span class="label">Creator</span>
        <span class="value">${escapeHtml(sellerName || "A KAIZORA creator")}</span>
      </div>
      <div class="detail-row">
        <span class="label">License</span>
        <span class="value">${escapeHtml(licenseType)}</span>
      </div>
      <div class="detail-row" style="border:none;">
        <span class="label">Amount paid</span>
        <span class="value" style="font-size:18px;font-weight:600;">${price}</span>
      </div>
    </div>

    <p style="font-size:14px;color:#666;">A separate email with your license certificate (PDF) is on its way.</p>
    <p><a class="btn" href="${SITE_URL}/library">View your library</a></p>
  `;

  await safeSend({
    to,
    subject: `Your purchase: ${assetTitle}`,
    html: layout({ subtitle: "Purchase Confirmed", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 5) Report resolved (to reporter)
// ─────────────────────────────────────────────────────────────

export async function sendReportResolvedEmail(params: {
  to: string;
  reporterName: string;
  assetTitle: string;
  action: "removed" | "dismissed";
}): Promise<void> {
  const { to, reporterName, assetTitle, action } = params;

  const isRemoved = action === "removed";
  const message = isRemoved
    ? "Thanks for keeping the platform safe. The asset you reported has been reviewed and removed from the marketplace."
    : "We've reviewed your report and determined that no action was needed at this time. Thanks for helping us keep KAIZORA safe.";

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">Update on your report</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(reporterName || "there")},</p>

    <div class="info">
      <strong style="font-size:14px;">Reported asset:</strong>
      <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(assetTitle)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#444;">Outcome: <strong>${isRemoved ? "Removed" : "No action taken"}</strong></p>
    </div>

    <p style="font-size:14px;color:#444;">${message}</p>

    <p style="font-size:14px;color:#666;margin-top:24px;">If you have further concerns, you can submit another report or contact our support team.</p>
  `;

  await safeSend({
    to,
    subject: "Update on your report",
    html: layout({ subtitle: "Report Outcome", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 7) DMCA takedown notice (sent to the designated DMCA agent)
// ─────────────────────────────────────────────────────────────

export async function sendDmcaNoticeEmail(params: {
  to: string;
  complainantName: string;
  complainantEmail: string;
  complainantPhone?: string;
  complainantAddress: string;
  copyrightedWork: string;
  infringingUrl: string;
  signature: string;
}): Promise<void> {
  const {
    to,
    complainantName,
    complainantEmail,
    complainantPhone,
    complainantAddress,
    copyrightedWork,
    infringingUrl,
    signature,
  } = params;

  const row = (label: string, value: string) => `
    <div class="detail-row">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
    </div>`;

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">New DMCA Takedown Notice</h2>
    <p style="color:#666;font-size:14px;">A copyright owner has submitted a DMCA takedown notice via the website form.</p>

    <div class="alert">
      <strong style="font-size:14px;">Infringing URL</strong>
      <p style="margin:4px 0 0;font-size:14px;word-break:break-all;">${escapeHtml(infringingUrl)}</p>
    </div>

    ${row("Complainant", complainantName)}
    ${row("Email", complainantEmail)}
    ${complainantPhone ? row("Phone", complainantPhone) : ""}
    ${row("Address", complainantAddress)}

    <div style="margin:20px 0;">
      <p style="font-size:14px;color:#333;"><strong>Copyrighted work claimed:</strong></p>
      <p style="font-size:14px;color:#555;white-space:pre-wrap;">${escapeHtml(copyrightedWork)}</p>
    </div>

    <div class="info">
      <p style="margin:0;font-size:13px;">The complainant affirmed the good-faith and accuracy statements under penalty of perjury.</p>
      <p style="margin:8px 0 0;font-size:13px;">Electronic signature: <strong>${escapeHtml(signature)}</strong></p>
    </div>

    <p style="font-size:13px;color:#666;margin-top:24px;">Review and respond within 48 hours per 17 U.S.C. &sect; 512.</p>
  `;

  await safeSend({
    to,
    subject: `DMCA Takedown Notice — ${complainantName}`,
    html: layout({ subtitle: "DMCA Takedown Notice", bodyHtml: body }),
  });
}

// ─────────────────────────────────────────────────────────────
// 8) Credit top-up (one-time pack OR auto top-up) — to buyer
// ─────────────────────────────────────────────────────────────

export async function sendCreditTopUpEmail(params: {
  to: string;
  name?: string;
  credits: number;
  amount: number; // dollars
  auto?: boolean;
  newBalance?: number | null;
  durationDays?: number;
}): Promise<void> {
  const { to, name, credits, amount, auto, newBalance, durationDays } = params;
  const validityDays = durationDays || 30;
  const price = `$${Number(amount).toFixed(2)} USD`;
  const heading = auto ? "⚡ Auto top-up complete" : "✅ Credits added";

  const body = `
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${heading}</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(name || "there")}, ${
      auto
        ? "your balance dropped below your threshold, so we automatically recharged your account."
        : "your credit top-up was successful."
    }</p>

    <div class="success">
      <strong style="font-size:14px;">${credits.toLocaleString()} credits added</strong>
      <p style="margin:4px 0 0;font-size:13px;color:#444;">charged <strong>${price}</strong></p>
    </div>

    <div style="margin: 24px 0;">
      <div class="detail-row">
        <span class="label">Credits added</span>
        <span class="value">${credits.toLocaleString()}</span>
      </div>
      ${
        typeof newBalance === "number"
          ? `<div class="detail-row">
              <span class="label">New balance</span>
              <span class="value">${newBalance.toLocaleString()} credits</span>
            </div>`
          : ""
      }
      <div class="detail-row" style="border:none;">
        <span class="label">Amount charged</span>
        <span class="value" style="font-size:18px;font-weight:600;">${price}</span>
      </div>
    </div>

    <p style="font-size:13px;color:#666;">Credits are valid for ${validityDays} days from purchase.</p>
    <p><a class="btn" href="${SITE_URL}/credits">View your credits</a></p>
  `;

  await safeSend({
    to,
    subject: auto
      ? "Auto top-up complete — KAIZORA"
      : "Your credits are ready — KAIZORA",
    html: layout({ subtitle: auto ? "Auto Top-up" : "Credits Added", bodyHtml: body }),
    from: BILLING_FROM,
  });
}

// ─────────────────────────────────────────────────────────────
// 9) Subscription activated / renewed — to subscriber
// ─────────────────────────────────────────────────────────────

export async function sendSubscriptionEmail(params: {
  to: string;
  name?: string;
  planName: string;
  credits: number;
  billingInterval: "month" | "year";
  amount?: number | null;
  renewal?: boolean;
}): Promise<void> {
  const { to, name, planName, credits, billingInterval, amount, renewal } =
    params;
  const cadence = billingInterval === "year" ? "year" : "month";
  const heading = renewal ? "🔄 Subscription renewed" : "🎉 Subscription activated";

  const body = `
    <h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${heading}</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(name || "there")}, ${
      renewal
        ? "your subscription renewed and fresh credits have been added."
        : "thanks for subscribing — your credits are ready to use."
    }</p>

    <div class="success">
      <strong style="font-size:14px;">${escapeHtml(planName)}</strong>
      <p style="margin:4px 0 0;font-size:13px;color:#444;">${credits.toLocaleString()} credits added</p>
    </div>

    <div style="margin: 24px 0;">
      <div class="detail-row">
        <span class="label">Plan</span>
        <span class="value">${escapeHtml(planName)}</span>
      </div>
      <div class="detail-row">
        <span class="label">Credits</span>
        <span class="value">${credits.toLocaleString()}</span>
      </div>
      <div class="detail-row">
        <span class="label">Billing</span>
        <span class="value">Every ${cadence}</span>
      </div>
      ${
        typeof amount === "number"
          ? `<div class="detail-row" style="border:none;">
              <span class="label">Amount</span>
              <span class="value" style="font-size:18px;font-weight:600;">$${amount.toFixed(2)}/${cadence}</span>
            </div>`
          : ""
      }
    </div>

    <p style="font-size:13px;color:#666;">Your subscription credits refresh monthly. Annual plans only change billing frequency.</p>
    <p><a class="btn" href="${SITE_URL}/credits">Manage subscription</a></p>
  `;

  await safeSend({
    to,
    subject: renewal
      ? "Your KAIZORA subscription renewed"
      : "Welcome — your KAIZORA subscription is active",
    html: layout({
      subtitle: renewal ? "Subscription Renewed" : "Subscription Activated",
      bodyHtml: body,
    }),
    from: BILLING_FROM,
  });
}

// ─────────────────────────────────────────────────────────────
// 10) Subscription cancelled — to subscriber
// ─────────────────────────────────────────────────────────────

export async function sendSubscriptionCancelledEmail(params: {
  to: string;
  name?: string;
  planName: string;
  immediate: boolean;
  accessUntil?: string | null;
}): Promise<void> {
  const { to, name, planName, immediate, accessUntil } = params;
  const until = accessUntil
    ? new Date(accessUntil).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">Subscription cancelled</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(name || "there")}, your <strong>${escapeHtml(planName)}</strong> subscription has been cancelled.</p>

    <div class="info">
      ${
        immediate
          ? `<p style="margin:0;font-size:14px;">Your subscription ended <strong>immediately</strong> and will not renew. Any remaining credits stay valid until their expiry.</p>`
          : `<p style="margin:0;font-size:14px;">Your subscription will not renew. You keep full access${
              until ? ` until <strong>${until}</strong>` : " until the end of your billing period"
            }.</p>`
      }
    </div>

    <p style="font-size:14px;color:#666;margin-top:24px;">Changed your mind? You can resubscribe anytime.</p>
    <p><a class="btn" href="${SITE_URL}/pricing">View plans</a></p>
  `;

  await safeSend({
    to,
    subject: "Your KAIZORA subscription was cancelled",
    html: layout({ subtitle: "Subscription Cancelled", bodyHtml: body }),
    from: BILLING_FROM,
  });
}

// ─────────────────────────────────────────────────────────────
// 11) Subscription payment failed — to subscriber
// ─────────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail(params: {
  to: string;
  name?: string;
  planName: string;
}): Promise<void> {
  const { to, name, planName } = params;

  const body = `
    <h2 style="font-weight:400;font-size:20px;margin-bottom:8px;">Payment failed</h2>
    <p style="color:#666;font-size:14px;">Hi ${escapeHtml(name || "there")}, we couldn't process the payment for your <strong>${escapeHtml(planName)}</strong> subscription.</p>

    <div class="alert">
      <p style="margin:0;font-size:14px;">Please update your payment method to keep your credits and avoid losing access. We'll retry the charge automatically.</p>
    </div>

    <p style="font-size:14px;color:#666;margin-top:24px;">Update your card to keep your subscription active.</p>
    <p><a class="btn" href="${SITE_URL}/credits">Update payment method</a></p>
  `;

  await safeSend({
    to,
    subject: "Action needed: your KAIZORA payment failed",
    html: layout({ subtitle: "Payment Failed", bodyHtml: body }),
    from: BILLING_FROM,
  });
}
