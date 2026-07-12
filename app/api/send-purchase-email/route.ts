import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Create transporter
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
    const {
      to,
      assetTitle,
      licenseType,
      purchasePrice,
      licenseNumber,
      purchaseDate,
      certificatePdfBase64,
    } = await req.json();

    // Email HTML
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
    .detail-row { padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; }
    .label { font-weight: 600; color: #666; }
    .value { color: #000; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-weight: 300; font-size: 32px;">KAIZORA</h1>
      <p style="margin: 10px 0 0; opacity: 0.8; font-size: 14px;">Purchase Confirmation</p>
    </div>
    
    <div class="content">
      <h2 style="margin-top: 0; font-weight: 300;">Thank you for your purchase!</h2>
      <p>Your license certificate is attached to this email.</p>
      
      <div style="margin: 30px 0;">
        <div class="detail-row">
          <span class="label">Asset</span>
          <span class="value">${assetTitle}</span>
        </div>
        
        <div class="detail-row">
          <span class="label">License Type</span>
          <span class="value">${licenseType}</span>
        </div>
        
        <div class="detail-row">
          <span class="label">License Number</span>
          <span class="value">${licenseNumber}</span>
        </div>
        
        <div class="detail-row">
          <span class="label">Purchase Date</span>
          <span class="value">${new Date(
            purchaseDate,
          ).toLocaleDateString()}</span>
        </div>
        
        <div class="detail-row" style="border: none;">
          <span class="label">Amount Paid</span>
          <span class="value" style="font-size: 18px; font-weight: 600;">$${(
            purchasePrice / 100
          ).toFixed(2)} USD</span>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p style="margin: 5px 0;">Need help? Contact us at info@KAIZORA.ai</p>
      <p style="margin: 5px 0;">© ${new Date().getFullYear()} KAIZORA. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    const emailText = `
Thank you for your purchase!

Asset: ${assetTitle}
License Type: ${licenseType}
License Number: ${licenseNumber}
Purchase Date: ${new Date(purchaseDate).toLocaleDateString()}
Amount Paid: $${(purchasePrice / 100).toFixed(2)} USD

Your license certificate is attached to this email.

Need help? Contact us at info@KAIZORA.ai
    `.trim();

    // Mail options
    const mailOptions: any = {
      from: '"KAIZORA" <info@KAIZORA.ai>',
      to: to,
      subject: `Purchase Confirmation - ${assetTitle}`,
      text: emailText,
      html: emailHtml,
    };

    // Add PDF attachment if provided
    if (certificatePdfBase64) {
      mailOptions.attachments = [
        {
          filename: `${licenseNumber}.pdf`,
          content: certificatePdfBase64,
          encoding: "base64",
        },
      ];
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent:", info.messageId);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error("❌ Email error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
