"use client";

import { useEffect } from "react";
import { Lock, DollarSign, Shield } from "lucide-react";

export default function LicensingGuidePage() {
  useEffect(() => {
    let scrollInterval: NodeJS.Timeout;
    let isAutoScrolling = true;

    const startAutoScroll = () => {
      scrollInterval = setInterval(() => {
        if (isAutoScrolling) {
          window.scrollBy({ top: 1, behavior: "smooth" });
          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 10
          ) {
            clearInterval(scrollInterval);
          }
        }
      }, 70);
    };

    const timeout = setTimeout(startAutoScroll, 500);

    const handleUserInteraction = () => {
      isAutoScrolling = false;
      clearInterval(scrollInterval);
    };

    window.addEventListener("wheel", handleUserInteraction, { passive: true });
    window.addEventListener("touchstart", handleUserInteraction, { passive: true });
    window.addEventListener("touchmove", handleUserInteraction, { passive: true });
    window.addEventListener("keydown", handleUserInteraction);
    window.addEventListener("mousedown", handleUserInteraction);

    return () => {
      clearTimeout(timeout);
      clearInterval(scrollInterval);
      window.removeEventListener("wheel", handleUserInteraction);
      window.removeEventListener("touchstart", handleUserInteraction);
      window.removeEventListener("touchmove", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      window.removeEventListener("mousedown", handleUserInteraction);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="pt-16 md:pt-32 pb-10 md:pb-20 px-3 md:px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-5xl font-extralight mb-4 md:mb-6 text-gray-300">
            Licensing Guide
          </h1>
          <p className="text-base md:text-xl text-gray-400 font-light leading-relaxed mb-6 md:mb-8">
            Understanding content licenses and usage rights on KAIZORA.
          </p>

          <div className="border-l-2 border-gray-700 pl-4 md:pl-6 mt-6 md:mt-12">
            <p className="text-sm md:text-lg text-gray-300 font-light leading-relaxed mb-4">
              KAIZORA offers three content licenses. The license a buyer chooses
              at checkout decides what they can do with the asset — view it,
              remix it, or resell it.
            </p>
            <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
              Each license has fixed, platform-defined rules. They are the same
              for every asset.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-6 md:py-16 px-3 md:px-6">
        <div className="max-w-4xl mx-auto space-y-8 md:space-y-20">

          {/* Personal Use */}
          <div>
            <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
              <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg md:text-3xl font-light text-white">
                  Personal Use
                </h2>
                <p className="text-xs md:text-lg text-gray-400 font-light mt-1">
                  View and download for personal, non-commercial use only.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  Buyer CAN:
                </h3>
                <div className="space-y-3">
                  {[
                    "View the asset on KAIZORA.",
                    "Download the asset for personal, non-commercial projects.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  Buyer CANNOT:
                </h3>
                <div className="space-y-3">
                  {[
                    "Use the asset in commercial or revenue-generating work.",
                    "Remix the asset or create derivative works.",
                    "Resell or redistribute the asset.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                <span className="text-gray-300">Best for: </span>
                Buyers who simply want the asset for personal projects and don't
                need to remix or resell it. The most affordable tier.
              </p>
            </div>
          </div>

          {/* Commercial Use */}
          <div>
            <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
              <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg md:text-3xl font-light text-white">
                  Commercial Use
                </h2>
                <p className="text-xs md:text-lg text-gray-400 font-light mt-1">
                  Use commercially and remix — with a royalty back to the
                  original creator.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  Buyer CAN:
                </h3>
                <div className="space-y-3">
                  {[
                    "Use the asset in commercial, revenue-generating projects.",
                    "Remix the asset in KAIZORA's Remix Studio.",
                    "Resell the asset or sell remixes of it.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  How the royalty works:
                </h3>
                <div className="space-y-3">
                  {[
                    "When a buyer resells or sells a remix, the license stays locked to Commercial — it cannot be changed.",
                    "A platform royalty (set by KAIZORA, 3% by default) of every downstream sale is paid to the original creator — forever.",
                    "Remix lineage is tracked automatically so the original creator is always credited and paid.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                <span className="text-gray-300">Best for: </span>
                Creators who want their work used commercially and remixed, while
                still earning a cut every time it changes hands.
              </p>
            </div>
          </div>

          {/* Royalty-Free */}
          <div>
            <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
              <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg md:text-3xl font-light text-white">
                  Royalty-Free
                </h2>
                <p className="text-xs md:text-lg text-gray-400 font-light mt-1">
                  Full rights — the buyer owns it outright, no royalty owed.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  Buyer CAN:
                </h3>
                <div className="space-y-3">
                  {[
                    "Use the asset commercially without restrictions.",
                    "Remix the asset freely.",
                    "Resell the asset and sell remixes of it.",
                    "Choose any license when reselling — they are not locked.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  Key point:
                </h3>
                <div className="space-y-3">
                  {[
                    "No royalty is ever owed to the original creator.",
                    "Once bought Royalty-Free, the buyer becomes the full owner of their copy.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                <span className="text-gray-300">Best for: </span>
                Buyers who want complete, unrestricted ownership — and creators
                pricing their work as a one-time, full-rights sale. The highest
                tier.
              </p>
            </div>
          </div>

          {/* Choosing the Right License */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-4 md:mb-8 text-white">
              Choosing the Right License
            </h2>
            <div className="space-y-6">
              {[
                {
                  label: "Personal Use",
                  body: "when you only need the asset for your own personal projects — no commercial use, no remixing.",
                },
                {
                  label: "Commercial Use",
                  body: "when you want to use the asset commercially or remix it — accepting that the original creator earns a royalty on resales.",
                },
                {
                  label: "Royalty-Free",
                  body: "when you want full, unrestricted ownership with no royalty obligations and the freedom to resell however you like.",
                },
              ].map((item, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    <span className="text-gray-300">Choose {item.label} </span>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notes */}
          <div className="pb-8 md:pb-20">
            <h2 className="text-xl md:text-3xl font-light mb-4 md:mb-8 text-white">
              Important Notes
            </h2>
            <div className="space-y-4">
              {[
                "A Commercial license stays locked to Commercial through every resale — it cannot be changed or upgraded.",
                "The creator royalty on Commercial assets is set by KAIZORA and applies platform-wide.",
                "All licenses assume the creator has the right to sell the content and is not infringing on others' rights.",
                "KAIZORA takes a platform fee from all paid transactions to maintain the marketplace.",
                "Violations of license terms may result in account suspension and legal action.",
              ].map((item, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
