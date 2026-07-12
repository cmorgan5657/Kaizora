"use client";

export default function AIDisclosurePage() {
  const tiers = [
    {
      name: "KAIZORA Core",
      description: "General reasoning, text generation, and orchestration across the platform.",
      icon: "🧠",
    },
    {
      name: "KAIZORA Vision",
      description: "Image and frame analysis, content evaluation, and multimodal understanding.",
      icon: "👁",
    },
    {
      name: "KAIZORA Sound",
      description: "Music composition and audio generation.",
      icon: "🎵",
    },
    {
      name: "KAIZORA Motion",
      description: "Video generation and motion synthesis.",
      icon: "🎬",
    },
    {
      name: "KAIZORA Voice",
      description: "Voice synthesis and text-to-speech.",
      icon: "🎙",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">

      <section className="pt-16 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs text-gray-600 uppercase tracking-widest">Transparency</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extralight mb-4 tracking-tight">AI Disclosure</h1>
          <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xl">
            KAIZORA utilizes multiple third-party artificial intelligence providers. These vendors may vary over time. Model names branded as KAIZORA denote capability levels rather than specific vendors.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto space-y-10">

          {/* Capability Tiers */}
          <div>
            <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-6">Capability Tiers</h2>
            <div className="space-y-3">
              {tiers.map((tier) => (
                <div key={tier.name} className="flex items-start gap-4 bg-white/[0.03] border border-white/10 rounded-xl p-4 md:p-5">
                  <div className="text-2xl shrink-0 mt-0.5">{tier.icon}</div>
                  <div>
                    <div className="text-sm font-light text-white mb-1">{tier.name}</div>
                    <p className="text-sm text-gray-500 font-light leading-relaxed">{tier.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Why tiers */}
          <div className="flex gap-6 md:gap-10 py-8 border-t border-white/[0.06]">
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">Why Capability Tiers?</h2>
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                The AI industry changes rapidly. By naming capabilities rather than vendors, KAIZORA can upgrade underlying technology without disrupting user experience. Feature labels describe functionality, not the current processing vendor.
              </p>
            </div>
          </div>

          {/* Provider transparency */}
          <div className="flex gap-6 md:gap-10 py-8 border-t border-white/[0.06]">
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">Provider Transparency</h2>
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                For legal and privacy compliance, specific third-party processors receiving KAIZORA content are documented in the{" "}
                <a href="/privacy" className="text-red-400 hover:text-red-300 transition-colors">Privacy Policy</a>{" "}
                and{" "}
                <a href="/terms" className="text-red-400 hover:text-red-300 transition-colors">Terms of Service</a>{" "}
                as authoritative sources for data processor information.
              </p>
            </div>
          </div>

        </div>
      </section>

      <section className="py-10 px-4 md:px-6 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-gray-600 font-light">© {new Date().getFullYear()} KAIZORA. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <a href="/privacy" className="hover:text-gray-400 transition-colors">Privacy Policy</a>
            <a href="/ai-content-license" className="hover:text-gray-400 transition-colors">AI Content License</a>
            <a href="/terms" className="hover:text-gray-400 transition-colors">Terms of Service</a>
          </div>
        </div>
      </section>
    </div>
  );
}
