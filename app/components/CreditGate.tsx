"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Zap, ArrowLeft } from "lucide-react";
import { useCreditBalance } from "@/app/hooks/useCreditStatus";

/**
 * Full-page paywall: when the logged-in user has zero credits, blur the page
 * content and show an "Insufficient balance" modal that sends them to top up.
 * Renders nothing when the user has any credits or is logged out.
 *
 * Drop it once inside a paid feature page (it covers the viewport via fixed).
 */
export default function CreditGate() {
  const router = useRouter();
  const balance = useCreditBalance();

  // Only gate a logged-in user who is fully out of credits.
  if (balance === null || balance > 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Blurred backdrop over the page content */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm border border-white/10 bg-black p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Insufficient balance</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          You&apos;ve run out of credits. Top up to continue using this feature.
        </p>

        <button
          type="button"
          onClick={() => router.push("/credits")}
          className="mt-5 flex w-full items-center justify-center gap-1.5 bg-red-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
        >
          <Zap className="h-3.5 w-3.5" />
          Upgrade or Top Up
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-2 flex w-full items-center justify-center gap-1.5 border border-white/10 px-4 py-2.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Go Back
        </button>
      </div>
    </div>
  );
}
