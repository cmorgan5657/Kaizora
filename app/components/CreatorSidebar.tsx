"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Settings2,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import { Money, Flag } from "phosphor-react";

type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  showAlways: boolean;
  requiresSubscription?: boolean;
};

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/creator", icon: LayoutDashboard, showAlways: true },
  { name: "Assets", href: "/creator/assets", icon: Package, showAlways: true },
  { name: "Commerce AI", href: "/creator/commerce", icon: Sparkles, showAlways: true },
  { name: "Earnings", href: "/creator/earnings", icon: Money, showAlways: true },
  { name: "Reports", href: "/creator/reports", icon: Flag, showAlways: true },
  { name: "Settings", href: "/creator/creatorSettings", icon: Settings2, showAlways: true },
];

const STORAGE_KEY = "creator-sidebar-collapsed";

export default function CreatorSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false); // desktop collapsed state
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  // ── Persisted collapsed state ───────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    // Notify layout (if it cares about width)
    window.dispatchEvent(new CustomEvent("creator-sidebar-toggle", { detail: { collapsed: next } }));
  }

  // ── Subscription check ──────────────────────────────────────────────
  useEffect(() => {
    checkSubscription();
    fetchPendingReports();
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen && typeof window !== "undefined" && window.innerWidth < 1024) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  async function fetchPendingReports() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/creator/reports", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const pending = (data.flags ?? []).filter(
        (f: { status: string }) => f.status === "pending"
      ).length;
      setPendingReportsCount(pending);
    } catch {
      // silently ignore
    }
  }

  async function checkSubscription() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: subscription } = await supabase
        .from("user_subscriptions")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();
      setHasSubscription(!!subscription);
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setLoading(false);
    }
  }

  const isActive = (href: string) => {
    if (href === "/creator") return pathname === "/creator";
    return pathname?.startsWith(href);
  };

  const filteredNavItems = navItems.filter((item) => {
    if (item.showAlways) return true;
    if (item.requiresSubscription) return hasSubscription;
    return true;
  });

  // ── Width classes ────────────────────────────────────────────────────
  const desktopWidth = collapsed ? "lg:w-16" : "lg:w-64";

  return (
    <>
      {/* ─────────── MOBILE HAMBURGER (only <lg) ─────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-[80] p-2 bg-black/80 border border-white/10 text-white rounded-md hover:bg-white/10"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ─────────── MOBILE OVERLAY ─────────── */}
      <div
        className={`lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] transition-opacity duration-300 ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* ─────────── SIDEBAR ─────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-screen bg-black border-r border-white/10 z-[70] flex flex-col
          transition-all duration-300 ease-out
          ${mobileOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full"}
          lg:relative lg:top-auto lg:translate-x-0 lg:h-full lg:flex-shrink-0
          ${desktopWidth}
        `}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between min-h-[56px]">
          {!collapsed && (
            <span className="text-sm font-light tracking-wide bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent whitespace-nowrap">
              Creator Panel
            </span>
          )}
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Desktop collapse toggle (inside header when expanded) */}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex text-gray-400 hover:text-white p-1 rounded transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {/* Desktop expand button (collapsed state) */}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex text-gray-400 hover:text-white mx-auto p-1 rounded transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-full h-10 bg-white/5 rounded-sm animate-pulse"
                />
              ))}
            </div>
          ) : (
            filteredNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const isReports = item.href === "/creator/reports";
              const showDot = isReports && pendingReportsCount > 0;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  title={collapsed ? item.name : undefined}
                  className={`
                    w-full group flex items-center ${collapsed ? "lg:justify-center" : "justify-between"}
                    px-3 py-3 rounded-sm transition-all duration-200 cursor-pointer
                    ${
                      active
                        ? "bg-red-500/10 border border-red-400/40 text-red-400"
                        : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                    }
                  `}
                >
                  <div className={`flex items-center ${collapsed ? "lg:justify-center" : "space-x-3"}`}>
                    {/* Icon wrapper — relative so the dot can sit on it when collapsed */}
                    <span className="relative flex-shrink-0">
                      <Icon className="w-4 h-4" />
                      {showDot && collapsed && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-black" />
                      )}
                    </span>
                    <span className={`text-sm font-light whitespace-nowrap ${collapsed ? "lg:hidden" : ""}`}>
                      {item.name}
                    </span>
                    {/* Red dot next to label when expanded */}
                    {showDot && !collapsed && (
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </div>
                  {active && !collapsed && (
                    <ChevronRight className="w-3 h-3 text-red-400/60 hidden lg:block" />
                  )}
                </button>
              );
            })
          )}
        </nav>

      </aside>
    </>
  );
}
