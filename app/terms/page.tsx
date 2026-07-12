"use client";

export default function TermsPage() {
  const sections = [
    {
      number: "1",
      title: "Account Rules",
      content: `You must be at least 16 years old to use KAIZORA — see our Age Policy. You are responsible for the security of your credentials and for all activity on your account. One human, one account.`,
    },
    {
      number: "2",
      title: "Prohibited Content",
      content: `You may not upload, generate, list, or distribute via KAIZORA: CSAM, non-consensual intimate imagery, deepfakes of real identifiable persons without their consent, content that infringes third-party IP, content promoting violence or illegal activity, malware, or content that violates the acceptable-use policies of our AI providers.`,
    },
    {
      number: "3",
      title: "Marketplace Seller Responsibilities",
      content: `Sellers warrant that (a) they hold or have the right to grant the licenses they offer, (b) listings accurately describe the asset, (c) prompts and source materials did not violate third-party rights, and (d) they will respond to legitimate DMCA notices within 7 days. Sellers are responsible for their own tax obligations.`,
    },
    {
      number: "4",
      title: "Buyer Rights",
      content: `Buyers receive the license described on the listing page and detailed in our AI Content License. Buyers may report defective deliveries (corrupt files, wrong asset delivered, asset materially different from preview) within 14 days of purchase.`,
    },
    {
      number: "5",
      title: "Refund Policy",
      content: `Digital goods sold on KAIZORA are non-refundable except in the case of defective delivery as described in §4.\n\nEligible refund requests are processed within 14 days. KAIZORA reserves the right to refund and revoke access at its discretion in cases of fraud, chargeback abuse, or policy violation.`,
    },
    {
      number: "6",
      title: "Fees",
      content: `KAIZORA retains a 15% platform fee on each completed marketplace transaction. The remaining 85% is paid to the seller via Stripe Connect (or an approved fallback payout method) net of payment-processor fees charged by Stripe.`,
    },
    {
      number: "7",
      title: "Dispute Resolution",
      content: `Disputes between buyers and sellers should first be raised through KAIZORA support, who will attempt good-faith mediation. Disputes not resolved within 30 days may be escalated to binding arbitration in the governing-law jurisdiction listed below.`,
    },
    {
      number: "8",
      title: "Governing Law",
      content: `These Terms are governed by the laws of the applicable jurisdiction without regard to its conflict-of-law provisions. This clause will be finalised before public launch.`,
    },
    {
      number: "9",
      title: "Indemnification",
      content: `You agree to indemnify and hold harmless KAIZORA, its affiliates, and personnel from any claim, loss, or expense (including reasonable legal fees) arising from your content, your breach of these Terms, or your violation of any law or third-party right.`,
    },
    {
      number: "10",
      title: "Limitation of Liability",
      content: `To the maximum extent permitted by law, KAIZORA's aggregate liability for any claim arising from your use of the service is limited to the amounts you paid KAIZORA in the 12 months preceding the event giving rise to the claim. KAIZORA is not liable for indirect, incidental, consequential, or punitive damages.`,
    },
    {
      number: "11",
      title: "Changes",
      content: `We may update these Terms; continued use after the effective date of an update constitutes acceptance. Material changes will be flagged in-product and may require re-acceptance.`,
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Hero */}
      <section className="pt-16 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs text-gray-600 uppercase tracking-widest">Legal</span>
            <span className="w-8 h-px bg-white/10" />
            <span className="text-xs text-gray-600">Version 2026-05-01</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extralight mb-4 tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xl">
            These terms govern your use of KAIZORA. By accessing the platform you agree to be bound by them.
          </p>

        </div>
      </section>

      {/* Sections */}
      <section className="py-12 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto space-y-0">
          {sections.map((section, i) => (
            <div
              key={section.number}
              className="flex gap-6 md:gap-10 py-8 md:py-10 border-b border-white/[0.06] last:border-b-0"
            >
              {/* Section number */}
              <div className="shrink-0 w-8 text-right">
                <span className="text-xs text-gray-700 font-mono">{section.number.padStart(2, "0")}</span>
              </div>

              {/* Content */}
              <div className="flex-1">
                <h2 className="text-base md:text-lg font-light text-white mb-3">
                  {section.title}
                </h2>
                {section.content.split("\n\n").map((para, j) => (
                  <p key={j} className="text-sm text-gray-400 font-light leading-relaxed mb-3 last:mb-0">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>


    </div>
  );
}
