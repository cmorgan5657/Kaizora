"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { syncSubscriptionCredits } from "@/lib/syncSubscriptionCredits";
import { handleClientAuthFailure } from "@/lib/clientAuthFailure";
import { getCreditBuckets } from "@/lib/creditBuckets";

// Don't nag the user on pages where they'd already be topping up / subscribing.
const HIDE_ON = [
  "/credits",
  "/pricing",
  "/login",
  "/signup",
  "/complete-profile",
];

/**
 * App-wide "you're out of credits" modal. Only shows to a logged-in user who
 * has ACTUALLY had credits before (subscribed or purchased) and is now at 0 —
 * never to brand-new/free users who never had any. Dismissible with the ✕;
 * comes back once they've recovered credits and run out again.
 */
export default function CreditsExhaustedModal() {
  const pathname = usePathname();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [everHadCredits, setEverHadCredits] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (await handleClientAuthFailure(authError)) return;
      if (!user) {
        if (active) {
          setBalance(null);
          setEverHadCredits(false);
        }
        return;
      }
      await syncSubscriptionCredits();
      const { data, error: creditsError } = await supabase
        .from("user_credits")
        .select(
          "balance, total_purchased, subscription_credits, purchased_credits",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (await handleClientAuthFailure(creditsError)) return;
      if (!active) return;
      setBalance(getCreditBuckets(data).totalBalance);
      setEverHadCredits((data?.total_purchased ?? 0) > 0);
    };
    load();

    const channel = supabase
      .channel("credits-exhausted-modal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits" },
        load,
      )
      .subscribe();
    const onUpdated = () => load();
    window.addEventListener("credits-updated", onUpdated);

    return () => {
      active = false;
      channel.unsubscribe();
      window.removeEventListener("credits-updated", onUpdated);
    };
  }, []);

  // Show at most once per browser session.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("credits_exhausted_seen") === "1") {
        setDismissed(true);
      }
    } catch {}
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("credits_exhausted_seen", "1");
    } catch {}
  };

  const show =
    balance === 0 &&
    everHadCredits &&
    !dismissed &&
    !HIDE_ON.some((p) => pathname?.startsWith(p));

  const go = (path: string) => {
    dismiss();
    router.push(path);
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 w-full max-w-md border border-white/10 bg-black p-6 shadow-2xl"
          >
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute top-3 right-3 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <Zap className="h-6 w-6 text-red-400" />
            </div>
            <h2 className="text-center text-lg font-bold text-white">
              You&apos;re out of credits
            </h2>
            <p className="mt-1.5 text-center text-xs text-gray-400">
              Your balance is 0. Choose how you&apos;d like to keep going:
            </p>

            <div className="mt-5 space-y-2">
              <button
                onClick={() => go("/credits")}
                className="flex w-full items-center gap-3 border border-white/10 hover:border-red-500/40 p-3 text-left transition-colors cursor-pointer"
              >
                <Zap className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-white">Top up now</p>
                  <p className="text-[10px] text-gray-500">
                    Buy a one-time credit pack
                  </p>
                </div>
              </button>

              <button
                onClick={() => go("/credits?tab=auto")}
                className="flex w-full items-center gap-3 border border-white/10 hover:border-red-500/40 p-3 text-left transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-white">
                    Enable auto top-up
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Never run out — recharge automatically
                  </p>
                </div>
              </button>

              <button
                onClick={() => go("/pricing")}
                className="flex w-full items-center gap-3 border border-white/10 hover:border-red-500/40 p-3 text-left transition-colors cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-white">
                    Subscribe to a plan
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Get credits every month or year
                  </p>
                </div>
              </button>
            </div>

            <button
              onClick={dismiss}
              className="mt-4 w-full text-center text-[11px] text-gray-500 hover:text-white cursor-pointer"
            >
              Not now
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
