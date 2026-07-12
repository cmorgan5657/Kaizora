"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useCreditBalance, useActionCost } from "@/app/hooks/useCreditStatus";

/**
 * Shows an "Insufficient credits" indicator when the logged-in user's balance
 * is below the cost of the given action. Renders nothing otherwise (enough
 * credits, logged out, or unknown action). Clicking it goes to /credits.
 *
 * Pass the action key for the operation about to run, e.g. "remix_image" or
 * "decision_layer_text". Pass null to hide (e.g. before the user picks a mode).
 */
export default function InsufficientCreditsBadge({
  actionKey,
  className = "",
}: {
  actionKey: string | null;
  className?: string;
}) {
  const router = useRouter();
  const balance = useCreditBalance();
  const cost = useActionCost(actionKey);

  // Hide unless we know the user has too few credits for this action.
  if (balance === null || cost === null || cost === 0) return null;
  if (balance >= cost) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/credits")}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] md:text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/15 transition-colors cursor-pointer ${className}`}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      Insufficient credits ({balance}/{cost}) — Top up
    </button>
  );
}
