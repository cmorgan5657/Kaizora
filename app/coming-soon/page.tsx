"use client";

import { useRouter } from "next/navigation";

export default function ComingSoonPage() {
  const router = useRouter();

  function goToDecisionLayer() {
    sessionStorage.setItem("kz_decision_layer_welcome_trigger", "1");
    router.push("/decision-layer");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <section className="w-full max-w-xl border border-white/10 bg-zinc-950/80 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-red-400">
          Beta Access
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Coming Soon</h1>
        <p className="mt-3 text-zinc-300 text-sm">
          This section is not enabled for your beta account yet. Decision-Layer
          is currently the only active area.
        </p>
        <button
          onClick={goToDecisionLayer}
          className="mt-6 inline-flex items-center justify-center border border-red-500/60 px-5 py-2 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
        >
          Go to Decision-Layer
        </button>
      </section>
    </main>
  );
}
