"use client";

export default function AgePolicyPage() {
  const sections = [
    {
      number: "1",
      title: "Minimum Age",
      content: "You must be at least 16 years old to create a KAIZORA account. For jurisdictions with higher digital consent requirements, local law takes precedence.",
    },
    {
      number: "2",
      title: "Users Aged 16–18",
      bullets: [
        "A parent or legal guardian has reviewed and consented to KAIZORA use including the Terms of Service and Privacy Policy.",
        "They will not use marketplace selling, payouts, or paid features without guardian involvement.",
        "Guardians may contact KAIZORA to review, export, or delete account data at any time.",
      ],
    },
    {
      number: "3",
      title: "Age Verification",
      content: "KAIZORA requires users to provide their age at signup. Misrepresenting your age is a breach of our Terms of Service and grounds for immediate account termination.",
    },
    {
      number: "4",
      title: "Reporting Under-Age Users",
      content: "If you believe an account is being operated by someone below the minimum age, please contact us immediately so we can investigate and take appropriate action.",
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
          <h1 className="text-3xl md:text-5xl font-extralight mb-4 tracking-tight">Age Policy</h1>
          <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xl">
            KAIZORA is available to users aged 16 and above. This policy explains our age requirements and responsibilities.
          </p>
        </div>
      </section>

      {/* Minimum age callout */}
      <section className="px-4 md:px-6 pt-10">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 md:p-8 flex items-center gap-6">
            <div className="text-5xl md:text-6xl font-extralight text-white">16+</div>
            <div>
              <div className="text-base font-light text-white mb-1">Minimum age to use KAIZORA</div>
              <p className="text-sm text-gray-500 font-light">
                You must be at least 16 years old to create an account. This is verified at signup and strictly enforced.
              </p>
            </div>
          </div>
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
            <a href="/privacy" className="hover:text-gray-400 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </section>
    </div>
  );
}
