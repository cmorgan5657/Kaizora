// app/superadmin/layout.tsx
"use client";



import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";
import { usePathname } from "next/navigation";
import {
  Gauge,
  UsersFour,
  ShoppingBagOpen,
  TagSimple,
  Receipt,
  Lightning,
  Heartbeat,
  UsersThree,
  Percent,
  Shield,
  Scroll,
  Copyright,
  CurrencyDollar,
  Brain,
} from "phosphor-react";

export default function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.email !== SUPERADMIN_EMAIL) {
        router.push("/");
      }
    };

    checkAdmin();
  }, [router]);

  return (
    <div className="bg-black text-white">
      {/* Sidebar */}
      <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-64 border-r border-white/10 px-4 py-6 bg-black overflow-y-auto">
        <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-6">
          Admin Dashboard
        </h2>

        <nav className="space-y-1 text-sm">
          {/* Dashboard */}
          <a
            href="/superadmin"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Gauge size={20} weight="duotone" />
            Dashboard
          </a>

          {/* Users */}
          <a
            href="/superadmin/users"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/users"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <UsersFour size={20} weight="duotone" />
            Users
          </a>

          {/* Marketplace */}
          <a
            href="/superadmin/marketplace"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/marketplace"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <ShoppingBagOpen size={20} weight="duotone" />
            Marketplace
          </a>
          {/* Pricing */}
          <a
            href="/superadmin/pricing"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/pricing")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <TagSimple size={20} weight="duotone" />
            Pricing
          </a>
          {/* Top-Up Packs */}
          <a
            href="/superadmin/topup-packs"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/topup-packs")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Lightning size={20} weight="duotone" />
            Top-Up Packs
          </a>
          {/* Licenses */}
          <a
            href="/superadmin/licenses"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/licenses")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Scroll size={20} weight="duotone" />
            Licenses
          </a>
          {/* Royalty */}
          <a
            href="/superadmin/royalty"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/royalty")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Percent size={20} weight="duotone" />
            Royalty
          </a>
          {/* Platform Fee */}
          <a
            href="/superadmin/platform-fee"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/platform-fee")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Percent size={20} weight="duotone" />
            Platform Fee
          </a>
          {/* Transactions */}
          <a
            href="/superadmin/transactions"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/transactions"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Receipt size={20} weight="duotone" />
            Transactions
          </a>

          {/* Earnings */}
          <a
            href="/superadmin/earnings"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/earnings"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <CurrencyDollar size={20} weight="duotone" />
            Earnings
          </a>

          {/* AI Costs */}
          <a
            href="/superadmin/ai-costs"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/ai-costs"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Brain size={20} weight="duotone" />
            AI Costs
          </a>

          {/* Credits Usage */}
          <a
            href="/superadmin/credits-usage"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/credits-usage"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Lightning size={20} weight="duotone" />
            Credits Usage
          </a>

          {/* Activity */}
          <a
            href="/superadmin/activity"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname === "/superadmin/activity"
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Heartbeat size={20} weight="duotone" />
            Activity
          </a>

          {/* Moderation */}
          <a
            href="/superadmin/moderation"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/moderation")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Shield size={20} weight="duotone" />
            Moderation
          </a>

          {/* DMCA */}
          <a
            href="/superadmin/dmca"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/dmca")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Copyright size={20} weight="duotone" />
            DMCA
          </a>

          {/* Community */}
          <a
            href="/superadmin/community"
            className={`flex items-center gap-3 px-4 py-2 rounded-md transition-all ${
              pathname?.startsWith("/superadmin/community")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <UsersThree size={20} weight="duotone" />
            Community
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-64 pt-14 min-h-screen p-8">{children}</main>
    </div>
  );
}
