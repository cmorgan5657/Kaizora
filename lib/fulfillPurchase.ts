import { supabaseAdmin } from "@/lib/supabaseServer";
import { generateLicenseCertificate } from "@/lib/generateCertificate";
import { getLicenseRule } from "@/lib/licenses";
import { transferToSeller } from "@/lib/transferToSeller";
import { createNotification } from "@/lib/notifications";

/**
 * Fulfills a marketplace asset purchase server-side.
 *
 * Triggered by the Stripe `payment_intent.succeeded` webhook so fulfillment no
 * longer depends on the buyer's browser staying open. Idempotent — only
 * `pending` transactions are processed, and each is flipped to `paid` once
 * done, so Stripe webhook retries are safe.
 *
 * Money-critical steps (ownership, license, seller payout + royalty) always
 * run. Certificate + email are best-effort — a failure there is logged but
 * never blocks the purchase.
 */
export async function fulfillAssetPurchase(
  paymentIntentId: string,
  origin: string,
): Promise<{ fulfilled: number; skipped: boolean }> {
  const { data: txns } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId);

  const pending = (txns || []).filter((t) => t.status === "pending");
  if (pending.length === 0) {
    return { fulfilled: 0, skipped: true };
  }

  // Behind a tunnel (ngrok) the request origin can come through as
  // https://localhost — which the local http dev server can't answer.
  // Normalize it so the best-effort email fetch still works in dev.
  const emailBase = origin.replace(/^https:\/\/localhost/, "http://localhost");

  const createdLicenses: any[] = [];

  for (const txn of pending) {
    if (!txn.asset_id) {
      console.error("⚠️ transaction missing asset_id, skipping:", txn.id);
      continue;
    }

    // 1. Ownership — idempotent upsert on (buyer_id, asset_id).
    await supabaseAdmin.from("purchased_assets").upsert(
      {
        buyer_id: txn.buyer_id,
        seller_id: txn.creator_id || null,
        asset_id: txn.asset_id,
        listing_id: txn.listing_id || null,
        purchase_price: txn.amount_cents,
        purchased_at: new Date().toISOString(),
      },
      { onConflict: "buyer_id,asset_id", ignoreDuplicates: true },
    );

    // 2. License — insert only if not already recorded (idempotency).
    if (txn.license_type_id) {
      const { data: existing } = await supabaseAdmin
        .from("purchased_licenses")
        .select("id")
        .eq("buyer_id", txn.buyer_id)
        .eq("asset_id", txn.asset_id)
        .eq("license_type_id", txn.license_type_id)
        .maybeSingle();

      if (!existing) {
        const { data: lic, error: licErr } = await supabaseAdmin
          .from("purchased_licenses")
          .insert({
            buyer_id: txn.buyer_id,
            asset_id: txn.asset_id,
            seller_id: txn.creator_id || null,
            license_type_id: txn.license_type_id,
            purchase_price: txn.amount_cents,
            purchased_at: new Date().toISOString(),
          })
          .select(
            "*, license_type:license_types(*), asset:assets(title, content_type)",
          )
          .single();
        if (licErr) console.error("❌ purchased_licenses insert:", licErr);
        if (lic) createdLicenses.push({ ...lic, buyer_id: txn.buyer_id });
      }
    }

    // 3. Mark the transaction paid.
    await supabaseAdmin
      .from("transactions")
      .update({ status: "paid" })
      .eq("id", txn.id);

    // 4. In-app notifications — buyer + seller.
    const { data: assetRow } = await supabaseAdmin
      .from("assets")
      .select("title")
      .eq("id", txn.asset_id)
      .single();
    const assetTitle = assetRow?.title || "an asset";

    createNotification({
      user_id: txn.buyer_id,
      type: "purchase_confirmed",
      title: "Purchase confirmed",
      body: `You purchased "${assetTitle}"`,
      link: "/my-assets",
      metadata: { asset_id: txn.asset_id, price_cents: txn.amount_cents },
    });

    if (txn.creator_id) {
      createNotification({
        user_id: txn.creator_id,
        type: "new_sale",
        title: "🎉 New sale!",
        body: `Someone bought "${assetTitle}"`,
        link: "/creator/earnings",
        metadata: { asset_id: txn.asset_id, price_cents: txn.amount_cents },
      });
    }
  }

  // 4. Seller payout + royalty split — grouped per seller.
  const bySeller = new Map<string, any[]>();
  for (const txn of pending) {
    if (!txn.creator_id) continue;
    if (!bySeller.has(txn.creator_id)) bySeller.set(txn.creator_id, []);
    bySeller.get(txn.creator_id)!.push(txn);
  }

  for (const [sellerId, sellerTxns] of bySeller) {
    const amount = sellerTxns.reduce((s, t) => s + (t.amount_cents || 0), 0);
    try {
      // Direct function call — no HTTP self-request (avoids proxy/SSL issues).
      await transferToSeller({
        seller_id: sellerId,
        amount_cents: amount,
        asset_id: sellerTxns[0].asset_id,
        items: sellerTxns.map((t) => ({
          asset_id: t.asset_id,
          price_cents: t.amount_cents,
        })),
      });
    } catch (e) {
      console.error("❌ transferToSeller failed for", sellerId, e);
    }
  }

  // 5. Certificate + confirmation email — best-effort, never blocks the sale.
  for (const lic of createdLicenses) {
    try {
      const licRule = getLicenseRule(lic.license_type?.slug);
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
        lic.buyer_id,
      );
      const buyerEmail = authUser?.user?.email || "";

      const pdf = await generateLicenseCertificate({
        license_number: lic.license_number,
        asset_title: lic.asset?.title,
        asset_type: lic.asset?.content_type,
        license_type_name: licRule?.name || lic.license_type?.name,
        license_type_description:
          lic.license_type?.description,
        buyer_email: buyerEmail,
        purchase_date: lic.purchased_at,
        purchase_price: lic.purchase_price,
        allows_commercial_use: licRule ? licRule.slug !== "personal" : false,
        can_modify: !!licRule?.canRemix,
        can_resell: !!licRule?.canResell,
      });

      const arrayBuffer = pdf.output("arraybuffer");
      const pdfBuffer = Buffer.from(arrayBuffer);
      const fileName = `${lic.license_number}.pdf`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from("certificates")
        .upload(fileName, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadErr) {
        const { data: urlData } = supabaseAdmin.storage
          .from("certificates")
          .getPublicUrl(fileName);
        await supabaseAdmin
          .from("purchased_licenses")
          .update({
            certificate_url: urlData.publicUrl,
            certificate_generated_at: new Date().toISOString(),
          })
          .eq("id", lic.id);
      }

      if (buyerEmail) {
        const pdfBase64 = Buffer.from(arrayBuffer).toString("base64");
        await fetch(`${emailBase}/api/send-purchase-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: buyerEmail,
            assetTitle: lic.asset?.title,
            licenseType: lic.license_type?.name,
            purchasePrice: lic.purchase_price,
            licenseNumber: lic.license_number,
            purchaseDate: lic.purchased_at,
            certificatePdfBase64: pdfBase64,
          }),
        }).catch((e) => console.error("Purchase email failed:", e));
      }
    } catch (e) {
      console.error("Certificate/email step failed (non-blocking):", e);
    }
  }

  return { fulfilled: pending.length, skipped: false };
}
