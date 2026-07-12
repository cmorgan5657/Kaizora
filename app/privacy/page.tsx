"use client";

export default function PrivacyPage() {
  const sections = [
    {
      number: "1",
      title: "Data We Collect",
      bullets: [
        "Account identifiers: email, username, display name, hashed password, IP address, and device/browser metadata.",
        "Uploaded assets: images, video, audio, text, and code you submit, plus any metadata you attach (titles, tags, descriptions).",
        "Generation prompts: text and reference assets you submit to KAIZORA AI features (Decision Layer, Remix Studio, Commerce agents).",
        "Payment info: processed by Stripe — KAIZORA does not store card numbers. We retain transaction IDs, amounts, currency, and Stripe customer/connect IDs.",
        "Usage data: pages visited, features used, agent runs, errors, and aggregated analytics.",
      ],
    },
    {
      number: "2",
      title: "Purposes",
      content: "We process the data above to operate the platform, fulfill orders, prevent fraud and abuse, comply with legal obligations, improve the service, and (where you have agreed) communicate with you about KAIZORA.",
    },
    {
      number: "3",
      title: "Third-Party Processors",
      bullets: [
        "Supabase — managed database, authentication, file storage, and edge compute.",
        "Stripe — payments processing for buyers.",
        "Stripe Connect — payouts and tax reporting for sellers.",
        "AI providers — generation and evaluation. The current portfolio is summarised on our AI Disclosure page; specific providers may change over time.",
      ],
    },
    {
      number: "4",
      title: "Retention",
      content: "We retain account data for the life of the account and for a reasonable period after deletion to satisfy legal, accounting, and fraud-prevention obligations. Anonymised analytics may be retained indefinitely.",
    },
    {
      number: "5",
      title: "Your Rights",
      content: "Subject to applicable law, you may request access to, a portable export of, correction of, or deletion of your personal data. Use the self-service controls in your account settings to file an export or deletion request. We will respond within the timeframe required by your jurisdiction (typically 30 days).",
    },
    {
      number: "6",
      title: "International Transfers",
      content: "KAIZORA and its processors may store and process your data in jurisdictions outside your country of residence, including the United States. By using KAIZORA you consent to such transfers where permitted by law.",
    },
    {
      number: "7",
      title: "Contact",
      content: "Questions about this policy or your rights? Reach out through our Contact page.",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="pt-16 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs text-gray-600 uppercase tracking-widest">Legal</span>
            <span className="w-8 h-px bg-white/10" />
            <span className="text-xs text-gray-600">Version 2026-05-01</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extralight mb-4 tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xl">
            How KAIZORA collects, uses, and protects your personal data.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          {sections.map((section) => (
            <div key={section.number} className="flex gap-6 md:gap-10 py-8 md:py-10 border-b border-white/[0.06] last:border-b-0">
              <div className="shrink-0 w-8 text-right">
                <span className="text-xs text-gray-700 font-mono">{section.number.padStart(2, "0")}</span>
              </div>
              <div className="flex-1">
                <h2 className="text-base md:text-lg font-light text-white mb-3">{section.title}</h2>
                {"bullets" in section && section.bullets ? (
                  <ul className="space-y-2">
                    {section.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-400 font-light leading-relaxed">
                        <span className="text-gray-700 mt-1.5 shrink-0">—</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 font-light leading-relaxed">{(section as any).content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10 px-4 md:px-6 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-gray-600 font-light">© {new Date().getFullYear()} KAIZORA. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <a href="/terms" className="hover:text-gray-400 transition-colors">Terms of Service</a>
            <a href="/dmca-policy" className="hover:text-gray-400 transition-colors">DMCA Policy</a>
            <a href="/ai-disclosure" className="hover:text-gray-400 transition-colors">AI Disclosure</a>
          </div>
        </div>
      </section>
    </div>
  );
}
