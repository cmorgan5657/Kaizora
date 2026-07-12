"use client";

export default function AIContentLicensePage() {
  const sections = [
    {
      number: "1",
      title: "Copyright Limitations",
      content: "The platform sells assets generated wholly or partially through AI systems. In certain jurisdictions like the United States, the Copyright Office has indicated that outputs lacking sufficient human creative authorship are not eligible for copyright registration. Consequently, purchasers may lack standing to pursue infringement claims against parties copying these assets.\n\nBuyers should approach AI-generated purchases similarly to public-domain or stock material: functional and cleared for use relative to KAIZORA, but potentially accessible to others.",
    },
    {
      number: "2",
      title: "How License Work in Kaizora",
      content: "When you buy an asset on KAIZORA you choose a license tier at checkout. Each tier defines how you may use the asset:",
      bullets: [
        "Personal — Ideal for personal explorations, practice projects, moodboards, or non-commercial creations. Assets under this license cannot be used in products, services, or content that generates revenue.",
        "Commercial — Designed for professional and business use. This license allows assets to be used in client projects, monetized products, branded content, marketing materials, and other commercial applications.",
        "Royalty-Free — A lifetime usage license with a single upfront payment. Use the asset across unlimited projects without recurring fees, attribution requirements, or ongoing royalty obligations.",
      ],
    },
    {
      number: "3",
      title: "Usage Constraints",
      bullets: [
        "We can't regulate content on other platforms.",
        "You may NOT redistribute assets on competing platforms.",
        "You may NOT use purchased assets to train competing AI systems without written authorization.",
        "You MAY create derivative works and commercialize those derivatives.",
        "Uses violating KAIZORA's Terms of Service or applicable laws are strictly forbidden.",
      ],
    },
    {
      number: "4",
      title: "Buyer Acknowledgement",
      content: "By completing a purchase on KAIZORA, you acknowledge that AI-generated assets may lack traditional copyright protection and exclusivity guarantees. This is confirmed at checkout.",
    },
    {
      number: "5",
      title: "Seller Warranties",
      bullets: [
        "Sellers represent they produced the assets or directed their production.",
        "Source materials and prompts used respected all third-party rights.",
        "Sellers possess full licensing authority over what they list.",
      ],
    },
    {
      number: "6",
      title: "Disclaimer",
      content: "Assets are provided \"as is\" with no warranties regarding fitness for purpose, non-infringement, or copyright eligibility, except where legally mandated.",
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
          <h1 className="text-3xl md:text-5xl font-extralight mb-4 tracking-tight">AI Content License</h1>
          <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xl">
            What you can and cannot do with AI-generated assets purchased on KAIZORA.
          </p>
       
        </div>
      </section>

      {/* Quick summary */}
      <section className="px-4 md:px-6 pt-10">
        <div className="max-w-3xl mx-auto grid grid-cols- md:grid-cols-2 gap-3">
          {[
            { icon: "✅", label: "Commercial use", desc: "Use in paid projects & products" },
            { icon: "✅", label: "Modify freely", desc: "Adapt, remix, create derivatives" },
          ].map((item) => (
            <div key={item.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-sm font-light text-white mb-1">{item.label}</div>
              <div className="text-xs text-gray-500">{item.desc}</div>
            </div>
          ))}
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
                {(section as any).content &&
                  (section as any).content
                    .split("\n\n")
                    .map((para: string, j: number) => (
                      <p key={j} className="text-sm text-gray-400 font-light leading-relaxed mb-3 last:mb-0">{para}</p>
                    ))}
                {"bullets" in section && section.bullets && (
                  <ul className="space-y-2 mt-3">
                    {section.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-400 font-light leading-relaxed">
                        <span className="text-gray-700 mt-1.5 shrink-0">—</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
