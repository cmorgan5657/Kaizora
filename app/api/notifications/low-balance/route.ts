import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(req: NextRequest) {
  try {
    const { email, balance, threshold } = await req.json();

    if (!email || threshold === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

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
      <p>You set up a notification to alert you when your credits balance falls below <strong>${threshold} credits</strong>.</p>

      <div class="alert-box">
        <div class="balance">${balance ?? 0} credits</div>
        <div class="threshold">Your alert threshold: ${threshold} credits</div>
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
</html>
    `;

    await transporter.sendMail({
      from: '"KAIZORA" <info@KAIZORA.ai>',
      to: email,
      subject: "Low Credits Balance Alert — KAIZORA",
      html: emailHtml,
      text: `Your KAIZORA credits balance is low.\n\nCurrent balance: ${balance ?? 0} credits\nAlert threshold: ${threshold} credits\n\nTop up at: https://kaizora.primedepthlabs.com/credits`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Low balance email error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
