"use client";

import { Lightning } from "phosphor-react";
import { TopUpPackSection } from "../pricing/TopUpPackSection";

export default function TopUpPacksAdminPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Lightning size={24} weight="duotone" className="text-red-400" />
          Top-Up Packs
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          One-time credit packs sold on the Top Up page. Only active subscribers
          can buy them.
        </p>
      </div>

      <div className="mb-6 border border-white/10 rounded-lg p-4 bg-white/[0.02] text-xs text-gray-300 leading-relaxed">
        <p className="font-semibold text-white mb-2">How this works</p>
        <ul className="space-y-1.5 list-disc pl-4">
          <li>
            <b>Monthly packs</b> → credits last <b>30 days</b>. Seen by{" "}
            <b>monthly and annual</b> subscribers.
          </li>
          <li>
            <b>Annual packs</b> → credits last <b>365 days</b>. Seen by{" "}
            <b>annual subscribers only</b>.
          </li>
          <li>
            A user with <b>no subscription</b> can&apos;t buy top-ups at all.
          </li>
          <li>
            These are <b>one-time</b> purchases, not recurring. Buying a pack
            never shortens a longer existing expiry.
          </li>
        </ul>
      </div>

      <div className="space-y-8">
        <TopUpPackSection tier="month" />
        <TopUpPackSection tier="year" />
      </div>
    </div>
  );
}
