"use client";

import { useEffect } from "react";

export default function FeaturesPage() {
  useEffect(() => {
    let scrollInterval: NodeJS.Timeout;
    let isAutoScrolling = true;

    const startAutoScroll = () => {
      scrollInterval = setInterval(() => {
        if (isAutoScrolling) {
          window.scrollBy({
            top: 1,
            behavior: "smooth",
          });

          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 10
          ) {
            clearInterval(scrollInterval);
          }
        }
      }, 30);
    };

    const timeout = setTimeout(startAutoScroll, 500);

    const handleUserInteraction = () => {
      isAutoScrolling = false;
      clearInterval(scrollInterval);
    };

    window.addEventListener("wheel", handleUserInteraction, { passive: true });
    window.addEventListener("touchstart", handleUserInteraction, {
      passive: true,
    });
    window.addEventListener("touchmove", handleUserInteraction, {
      passive: true,
    });
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
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl md:text-6xl font-extralight mb-6 tracking-tight">
            <span className="text-gray-300">Platform</span>{" "}
            <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
              Features
            </span>
          </h1>

          <p className="text-base md:text-xl text-gray-400 font-light leading-relaxed max-w-3xl mx-auto">
            Built entirely on AI agents. Every feature designed for autonomous
            operation, intelligent assistance, and seamless commerce.
          </p>
        </div>
      </section>

      {/* Core Features Grid */}
      <section className="py-8 md:py-16 px-3 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {/* AI-Guided Content Creation */}
            <div className="group relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-4 md:p-8 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <h3 className="text-lg md:text-2xl font-light mb-4 text-white group-hover:text-red-400 transition-colors duration-300">
                  AI-Guided Content Creation
                </h3>
                <p className="text-gray-400 font-light leading-relaxed mb-3">
                  Interact with AI agents to generate and refine your content.
                  The AI understands your creative intent, suggests
                  improvements, and optimizes outputs for maximum marketability.
                </p>
                <p className="text-gray-500 text-sm font-light leading-relaxed">
                  No complex tools. No manual tweaking. Just describe what you
                  want—the AI handles everything.
                </p>
              </div>
            </div>

            {/* Autonomous Publishing System */}
            <div className="group relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-4 md:p-8 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <h3 className="text-lg md:text-2xl font-light mb-4 text-white group-hover:text-red-400 transition-colors duration-300">
                  Autonomous Publishing System
                </h3>
                <p className="text-gray-400 font-light leading-relaxed mb-3">
                  AI agents automatically handle the entire publishing process.
                  They generate metadata, write descriptions, suggest pricing,
                  and publish to the marketplace.
                </p>
                <p className="text-gray-500 text-sm font-light leading-relaxed">
                  Zero configuration. Your content goes from creation to
                  marketplace in seconds.
                </p>
              </div>
            </div>

            {/* Intelligent Discovery Engine */}
            <div className="group relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-4 md:p-8 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <h3 className="text-lg md:text-2xl font-light mb-4 text-white group-hover:text-red-400 transition-colors duration-300">
                  Intelligent Discovery Engine
                </h3>
                <p className="text-gray-400 font-light leading-relaxed mb-3">
                  Buyers communicate needs in natural language. AI agents
                  understand context, interpret requirements, and search
                  millions of assets to find exact matches.
                </p>
                <p className="text-gray-500 text-sm font-light leading-relaxed">
                  Not just keyword search—the AI understands intent, style, and
                  compatibility.
                </p>
              </div>
            </div>

            {/* Smart Transaction Processing */}
            <div className="group relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-4 md:p-8 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <h3 className="text-lg md:text-2xl font-light mb-4 text-white group-hover:text-red-400 transition-colors duration-300">
                  Smart Transaction Processing
                </h3>
                <p className="text-gray-400 font-light leading-relaxed mb-3">
                  AI agents handle complete purchase workflows. They verify
                  licenses, process payments, manage delivery, and generate
                  receipts—all autonomously.
                </p>
                <p className="text-gray-500 text-sm font-light leading-relaxed">
                  Transactions complete in seconds. No approval queues. No
                  delays.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stripe Payment - Featured */}
      <section className="py-8 md:py-16 px-3 md:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="relative bg-black group p-5 md:p-12 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent" />
                <span className="text-sm text-red-400 uppercase tracking-wider">
                  Payment Integration
                </span>
              </div>

              <h2 className="text-3xl md:text-4xl font-extralight mb-6 tracking-tight">
                Secure Payment Processing{" "}
                <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                  by Stripe
                </span>
              </h2>

              <div className="grid md:grid-cols-3 gap-4 md:gap-8 mb-6">
                <div>
                  <h3 className="text-lg font-light mb-2 text-gray-300">
                    Enterprise-Grade Security
                  </h3>
                  <p className="text-gray-400 text-sm font-light leading-relaxed">
                    All transactions encrypted, PCI-compliant, and protected by
                    Stripe's advanced fraud detection.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-light mb-2 text-gray-300">
                    Instant Transactions
                  </h3>
                  <p className="text-gray-400 text-sm font-light leading-relaxed">
                    Creators receive instant payouts. Buyers get immediate asset
                    access. Zero processing delays.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-light mb-2 text-gray-300">
                    Global Support
                  </h3>
                  <p className="text-gray-400 text-sm font-light leading-relaxed">
                    Multiple currencies, payment methods, and international
                    coverage. AI handles all reconciliation.
                  </p>
                </div>
              </div>

              <p className="text-gray-500 text-sm font-light">
                AI agents handle all payment processing, refunds, and financial
                operations automatically.
              </p>
            </div>

            {/* Decorative corners */}
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>
        </div>
      </section>

      {/* Technical Capabilities */}
      <section className="py-8 md:py-16 px-3 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 md:mb-12 text-center">
            <h2 className="text-2xl md:text-4xl font-extralight mb-4 tracking-tight">
              Technical{" "}
              <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                Capabilities
              </span>
            </h2>
            <div className="flex items-center justify-center gap-4 mt-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-red-500/50" />
              <p className="text-sm text-gray-500 uppercase tracking-wider">
                Powered by AI Agents
              </p>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-red-500/50" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
            {[
              {
                title: "Natural Language Interaction",
                description:
                  "Communicate in plain language. No technical commands or complicated interfaces.",
              },
              {
                title: "Context-Aware AI Agents",
                description:
                  "AI remembers history, understands project context, maintains continuity across sessions.",
              },
              {
                title: "Zero Manual Configuration",
                description:
                  "No settings. No forms. No technical setup. AI handles all configuration automatically.",
              },
              {
                title: "24/7 Autonomous Operation",
                description:
                  "Platform operates continuously without downtime or maintenance windows.",
              },
              {
                title: "Instant Processing",
                description:
                  "No queues. No waiting for approval. Every operation completes in real-time.",
              },
              {
                title: "Agentic Backend",
                description:
                  "Specialized AI agents handle every function autonomously at machine speed.",
              },
            ].map((capability, index) => (
              <div
                key={index}
                className="bg-black p-4 md:p-6 group hover:bg-white/5 transition-colors duration-300 border border-white/5"
              >
                <h3 className="text-lg font-light mb-3 text-white group-hover:text-red-400 transition-colors duration-300">
                  {capability.title}
                </h3>
                <p className="text-sm text-gray-500 font-light leading-relaxed">
                  {capability.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Creators vs Buyers */}
      <section className="py-8 md:py-16 px-3 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {/* For Creators */}
            <div className="relative bg-black group p-4 md:p-10 hover:bg-white/5 transition-colors duration-300 border border-white/5">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />

              <h3 className="text-2xl md:text-3xl font-extralight tracking-tight mb-6">
                For{" "}
                <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                  Creators
                </span>
              </h3>

              <div className="space-y-4">
                {[
                  "AI-guided content generation and optimization",
                  "Automatic publishing and pricing",
                  "Performance analytics and insights",
                  "Instant payouts via Stripe",
                  "Portfolio building and audience growth",
                ].map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-400 font-light leading-relaxed">
                      {feature}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* For Buyers */}
            <div className="relative bg-black group p-4 md:p-10 hover:bg-white/5 transition-colors duration-300 border border-white/5">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />

              <h3 className="text-2xl md:text-3xl font-extralight tracking-tight mb-6">
                For{" "}
                <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                  Buyers
                </span>
              </h3>

              <div className="space-y-4">
                {[
                  "Natural language asset search",
                  "AI-powered recommendations",
                  "Instant purchase and delivery",
                  "Secure Stripe payment processing",
                  "Clear licensing and usage rights",
                ].map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-400 font-light leading-relaxed">
                      {feature}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The AI Difference - CTA */}
      <section className="py-10 md:py-20 px-3 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative border border-white/10 p-6 md:p-16 text-center overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 to-red-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative z-10">
              <h2 className="text-2xl md:text-4xl font-extralight mb-6 tracking-tight">
                The AI Difference
              </h2>
              <p className="text-base md:text-lg text-gray-400 font-light leading-relaxed mb-4 max-w-3xl mx-auto">
                Traditional marketplaces require extensive human
                operations—creating bottlenecks, delays, and scaling
                limitations.
              </p>
              <p className="text-base md:text-lg text-gray-400 font-light leading-relaxed max-w-3xl mx-auto">
                KAIZORA eliminates these constraints. AI agents operate 24/7,
                process thousands of requests simultaneously, and make
                intelligent decisions in real-time. This is commerce reimagined
                for the AI age.
              </p>
            </div>

            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t border-l border-red-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t border-r border-red-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b border-l border-red-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b border-r border-red-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </div>
        </div>
      </section>
    </div>
  );
}
