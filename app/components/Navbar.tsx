"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  X,
  ShoppingCart,
  Zap,
  ArrowUpRight,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { availableBalance } from "@/lib/creditExpiry";
import { clearBetaEmailCookie, setBetaEmailCookie } from "@/lib/betaAccess";
import { syncSubscriptionCredits } from "@/lib/syncSubscriptionCredits";
import NotificationBell from "./NotificationBell";

const DECISION_LAYER_WELCOME_TRIGGER_KEY = "kz_decision_layer_welcome_trigger";
type PrimaryNavItem =
  | { label: string; href: string }
  | { label: string; action: "decision-layer" };

const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "My Assets", href: "/my-assets" },
  { label: "Pulse", href: "/community" },
  { label: "Decision Layer", action: "decision-layer" },
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/creator" },
  { label: "Remix Studio", href: "/remix" },
];

export default function Navbar() {
  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [cartCount, setCartCount] = useState(0);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const creditsRef = useRef<HTMLDivElement | null>(null);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(
    null,
  );
  async function loadCartCount() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCartCount(0);
      return;
    }

    const { data, count } = await supabase
      .from("cart")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setCartCount(count || 0);
  }

  async function loadCreditBalance() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCreditBalance(0);
      return;
    }

    await syncSubscriptionCredits();

    const { data } = await supabase
      .from("user_credits")
      .select("balance, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    setCreditBalance(availableBalance(data?.balance, data?.expires_at));
  }

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
      if (
        creditsRef.current &&
        !creditsRef.current.contains(e.target as Node)
      ) {
        setIsCreditsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  async function loadUserProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserRole(null);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, avatar_url, display_name, is_banned")
      .eq("id", user.id)
      .single();

    // If user is banned, sign them out immediately
    if (profile?.is_banned) {
      await supabase.auth.signOut();
      setUser(null);
      window.location.href = "/login?error=suspended";
      return;
    }

    setUserRole(profile?.role || "user");
    setProfileAvatarUrl(profile?.avatar_url || null);
    setProfileDisplayName(profile?.display_name || null);
  }
  // Load Auth — only set mounted=true AFTER all dynamic data has loaded
  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();

      setUser(data.user);
      setBetaEmailCookie(data.user?.email);

      // For signed-out users, no extra fetches needed
      if (!data.user) {
        setMounted(true);
        return;
      }

      // Wait for all dynamic content to finish before showing the real navbar
      await Promise.allSettled([
        loadCartCount(),
        loadCreditBalance(),
        loadUserProfile(),
      ]);
      setMounted(true);
    }

    loadUser();

    // realtime auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setBetaEmailCookie(session?.user?.email);
        if (session?.user) {
          loadUserProfile();
          loadCreditBalance();
          loadCartCount();
        } else {
          setUserRole(null);
          setCreditBalance(0);
          setCartCount(0);
        }
      },
    );

    const cartChannel = supabase
      .channel("cart-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart" },
        () => loadCartCount(),
      )
      .subscribe();

    const creditsChannel = supabase
      .channel("credits-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits" },
        () => loadCreditBalance(),
      )
      .subscribe();

    const handleCreditsUpdated = () => loadCreditBalance();
    window.addEventListener("credits-updated", handleCreditsUpdated);

    return () => {
      authListener.subscription.unsubscribe();
      cartChannel.unsubscribe();
      creditsChannel.unsubscribe();
      window.removeEventListener("credits-updated", handleCreditsUpdated);
    };
  }, []);

  async function handleLogout() {
    setCartCount(0);
    setCreditBalance(0);
    await supabase.auth.signOut();
    clearBetaEmailCookie();
    setUser(null);
    router.push("/");
  }

  useEffect(() => {
    const handleScroll = () => {
      if (isMenuOpen) setIsMenuOpen(false);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMenuOpen]);

  function goToDecisionLayerWithWelcomeVoice() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DECISION_LAYER_WELCOME_TRIGGER_KEY, "1");
    }
    router.push("/decision-layer");
  }

  function handlePrimaryNavClick(item: PrimaryNavItem) {
    if ("action" in item && item.action === "decision-layer") {
      goToDecisionLayerWithWelcomeVoice();
      return;
    }

    if ("href" in item) {
      router.push(item.href);
    }
  }

  // Skeleton navbar — shown until auth + profile finish loading
  if (!mounted) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo skeleton */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-md bg-white/[0.06] animate-pulse" />
              <div className="h-4 w-20 bg-white/[0.06] rounded animate-pulse" />
            </div>

            {/* Desktop nav links skeleton */}
            <div className="hidden lg:flex items-center space-x-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 w-16 bg-white/[0.06] rounded animate-pulse"
                />
              ))}
            </div>

            {/* Right side actions skeleton */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block h-7 w-20 bg-white/[0.06] rounded-full animate-pulse" />
              <div className="w-8 h-8 rounded-full bg-white/[0.06] animate-pulse" />
              <div className="lg:hidden w-6 h-6 bg-white/[0.06] rounded animate-pulse" />
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? "bg-black/80 backdrop-blur-md " : " "
      }`}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}

          <div
            onClick={() => router.push("/")}
            className="flex items-center space-x-2 cursor-pointer group flex-shrink-0"
          >
            <img src="/logo.png" alt="Logo" className="w-8 h-8" />
            <span className="text-lg font-light tracking-tight">
              <span className="bg-linear-to-r from-red-500 to-red-600 bg-clip-text text-transparent">
                KAIZORA
              </span>
            </span>
          </div>
          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center space-x-4 xl:space-x-8">
            {userRole === "superadmin" ? (
              <>
                <button
                  onClick={() => router.push("/superadmin")}
                  className="text-sm text-gray-400 hover:text-white cursor-pointer transition-colors duration-300"
                >
                  Admin Dashboard
                </button>
              </>
            ) : (
              <>
                {PRIMARY_NAV_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => handlePrimaryNavClick(item)}
                    className="text-sm text-gray-400 hover:text-white cursor-pointer transition-colors duration-300"
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-4">
            {/* Credits Dropdown */}
            {mounted && user && userRole !== "superadmin" && (
              <div ref={creditsRef} className="relative">
                <button
                  onClick={() => setIsCreditsOpen(!isCreditsOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border rounded-full transition-all duration-300 cursor-pointer group ${
                    isCreditsOpen
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-white/10 hover:border-red-500/40 hover:bg-red-500/5"
                  }`}
                >
                  <Zap className="w-3 h-3 text-red-500" />
                  <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                    {creditBalance} credits
                  </span>
                </button>

                <div
                  className={`absolute right-0 mt-2 w-44 bg-black/95 backdrop-blur-xl border border-white/10 py-1 text-sm transition-all duration-300 origin-top-right ${
                    isCreditsOpen
                      ? "opacity-100 scale-100 translate-y-0"
                      : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
                  }`}
                >
                  <button
                    onClick={() => {
                      setIsCreditsOpen(false);
                      router.push("/credits");
                    }}
                    className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-200"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-light">Upgrade or Top Up</span>
                  </button>
                  <div className="h-px bg-white/5" />
                  <button
                    onClick={() => {
                      setIsCreditsOpen(false);
                      router.push("/usage");
                    }}
                    className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-200"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-light">Usage & History</span>
                  </button>
                </div>
              </div>
            )}
            {/* Cart Icon */}
            {userRole !== "superadmin" && (
              <div
                onClick={() => router.push("/cart")}
                className="relative cursor-pointer group"
              >
                <ShoppingCart className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors duration-300" />
                {mounted && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-linear-to-r from-red-500 to-red-600 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full font-light">
                    {cartCount}
                  </span>
                )}
              </div>
            )}
            {/* Auth Section */}
            {mounted && !user && (
              <button
                onClick={() => router.push("/login")}
                className="px-5 py-2 text-sm border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300"
              >
                Sign In
              </button>
            )}
            {mounted && user && userRole !== "superadmin" && <NotificationBell />}
            {mounted && user && (
              <div ref={menuRef} className="relative">
                {/* Avatar Button + Name */}
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className={`flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border transition-all duration-300 cursor-pointer ${isProfileOpen ? "border-red-400/60" : "border-white/10 hover:border-white/30"}`}
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                    <img
                      src={
                        profileAvatarUrl ||
                        user.user_metadata?.avatar_url ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(user.id)}`
                      }
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs font-light text-gray-300 max-w-[100px] truncate">
                    {profileDisplayName || user.email?.split("@")[0] || "Account"}
                  </span>
                </button>

                {/* Dropdown */}
                <div
                  className={`absolute right-0 mt-2 w-44 bg-black/90 backdrop-blur-xl border border-white/10 text-sm transition-all duration-300 origin-top-right ${
                    isProfileOpen
                      ? "opacity-100 scale-100 translate-y-0"
                      : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
                  }`}
                >
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-xs text-white font-light truncate">
                      {profileDisplayName || user.email?.split("@")[0]}
                    </p>
                    <p className="text-[10px] text-gray-600 font-light truncate mt-0.5">
                      {user.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setIsProfileOpen(false); router.push("/profile"); }}
                      className="block w-full text-left px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-200 text-xs font-light"
                    >
                      Profile
                    </button>
                    <div className="h-px bg-white/5 my-1" />
                    <button
                      onClick={() => { setIsProfileOpen(false); handleLogout(); }}
                      className="block w-full text-left px-4 py-2 text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-colors duration-200 text-xs font-light"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:hidden flex items-center gap-2">
            {/* Mobile Credits Dropdown */}
            {mounted && user && userRole !== "superadmin" && (
              <div className="relative">
                <button
                  onClick={() => setIsCreditsOpen(!isCreditsOpen)}
                  className={`flex items-center gap-1 px-2 py-1 bg-white/[0.04] border rounded-full transition-all cursor-pointer ${
                    isCreditsOpen
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-white/10 hover:border-red-500/40"
                  }`}
                >
                  <Zap className="w-2.5 h-2.5 text-red-500" />
                  <span className="text-[10px] text-gray-300">
                    {creditBalance}
                  </span>
                </button>

                <div
                  className={`absolute right-0 mt-2 w-40 bg-black/95 backdrop-blur-xl border border-white/10 py-1 text-sm transition-all duration-300 origin-top-right z-50 ${
                    isCreditsOpen
                      ? "opacity-100 scale-100 translate-y-0"
                      : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
                  }`}
                >
                  <button
                    onClick={() => {
                      setIsCreditsOpen(false);
                      router.push("/credits");
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-200"
                  >
                    <ArrowUpRight className="w-3 h-3 text-red-400" />
                    <span className="text-[11px] font-light">
                      Upgrade or Top Up
                    </span>
                  </button>
                  <div className="h-px bg-white/5" />
                  <button
                    onClick={() => {
                      setIsCreditsOpen(false);
                      router.push("/usage");
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-200"
                  >
                    <BarChart3 className="w-3 h-3 text-red-400" />
                    <span className="text-[11px] font-light">
                      Usage & History
                    </span>
                  </button>
                </div>
              </div>
            )}
            {/* Mobile Cart Icon */}
            {userRole !== "superadmin" && (
              <div
                onClick={() => router.push("/cart")}
                className="relative cursor-pointer group p-2"
              >
                <ShoppingCart className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors duration-300" />
                {mounted && cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-linear-to-r from-red-500 to-red-600 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full font-light">
                    {cartCount}
                  </span>
                )}
              </div>
            )}
            {/* Mobile Notification Bell */}
            {mounted && user && userRole !== "superadmin" && <NotificationBell />}
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300"
            >
              {isMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile Menu */}
      <div
        className={`lg:hidden bg-black/95 backdrop-blur-xl border-t border-white/10 transition-all duration-300 overflow-hidden ${
          isMenuOpen
            ? "max-h-[calc(100vh-4rem)] opacity-100"
            : "max-h-0 opacity-0"
        }`}
      >
        <div
          className="px-6 py-6 space-y-1 overflow-y-auto max-h-[calc(100vh-5rem)]"
          data-lenis-prevent
        >
          {userRole === "superadmin" ? (
            <button
              onClick={() => {
                setIsMenuOpen(false);
                router.push("/superadmin");
              }}
              className="block w-full text-left text-sm text-gray-400 hover:text-white py-2 transition-colors duration-200 font-light"
            >
              Admin Dashboard
            </button>
          ) : (
            <>
              {PRIMARY_NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setIsMenuOpen(false);
                    handlePrimaryNavClick(item);
                  }}
                  className="block w-full text-left text-sm text-gray-400 hover:text-white py-2 transition-colors duration-200 font-light"
                >
                  {item.label}
                </button>
              ))}
            </>
          )}

          <div className="h-px bg-white/10 my-4" />
          {/* Mobile Auth */}
          {mounted && !user && (
            <button
              onClick={() => {
                setIsMenuOpen(false);
                router.push("/login");
              }}
              className="w-full text-left px-4 py-2 text-sm border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300 font-light"
            >
              Sign In
            </button>
          )}
          {/* Mobile User Menu */}
          {mounted && user && (
            <div className="space-y-1 pt-2">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  router.push("/profile");
                }}
                className="block w-full text-left text-sm text-gray-400 hover:text-white py-2 transition-colors duration-200 font-light"
              >
                Profile
              </button>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleLogout();
                }}
                className="block w-full text-left text-sm text-gray-400 hover:text-red-400 py-2 transition-colors duration-200 font-light"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
