"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  User,
  Calendar,
  Lightning,
  CaretLeft,
  CaretRight,
  FunnelSimple,
  SortAscending,
  SortDescending,
  X,
  ArrowsClockwise,
} from "phosphor-react";
import AssetsTableSkeleton from "@/app/components/AssetsTableSkeleton";

const PAGE_SIZE = 15;

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  role: string;
  community_role: string | null;
  created_at: string;
  updated_at: string;
  stripe_onboarding_status: string | null;
  is_banned: boolean;
  credit_balance?: number;
  asset_count?: number;
  public_asset_count?: number;
};

type SortField =
  | "created_at"
  | "display_name"
  | "credit_balance"
  | "asset_count"
  | "public_asset_count";
type SortOrder = "asc" | "desc";
type CreditFilter =
  | "all"
  | "has_credits"
  | "no_credits"
  | "above_100"
  | "above_500"
  | "above_1000";
type JoinedFilter =
  | "all"
  | "today"
  | "7days"
  | "30days"
  | "90days"
  | "this_year";
type ProfileFilter =
  | "all"
  | "has_avatar"
  | "no_avatar"
  | "has_bio"
  | "no_bio"
  | "has_socials"
  | "no_socials";
type StripeFilter = "all" | "connected" | "pending" | "not_connected";
type ActivityFilter = "all" | "has_assets" | "has_public" | "no_activity";

export default function SuperAdminUsersPage() {
  const router = useRouter();
  const topRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [creditFilter, setCreditFilter] = useState<CreditFilter>("all");
  const [joinedFilter, setJoinedFilter] = useState<JoinedFilter>("all");
  const [communityRole, setCommunityRole] = useState<string>("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [stripeFilter, setStripeFilter] = useState<StripeFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  const [banLoading, setBanLoading] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: creditsData } = await supabase
        .from("user_credits")
        .select("user_id, balance");

      const { data: assetCounts } = await supabase
        .from("assets")
        .select("owner_id, is_public");

      const creditsMap: Record<string, number> = {};
      (creditsData || []).forEach((c: any) => {
        creditsMap[c.user_id] = c.balance ?? 0;
      });

      const assetCountMap: Record<string, number> = {};
      const publicAssetCountMap: Record<string, number> = {};
      (assetCounts || []).forEach((a: any) => {
        assetCountMap[a.owner_id] = (assetCountMap[a.owner_id] || 0) + 1;
        if (a.is_public) {
          publicAssetCountMap[a.owner_id] =
            (publicAssetCountMap[a.owner_id] || 0) + 1;
        }
      });

      const enriched = (profilesData || [])
        .filter((p) => p.role !== "superadmin")
        .map((p) => ({
          ...p,
          credit_balance: creditsMap[p.id] ?? 0,
          asset_count: assetCountMap[p.id] ?? 0,
          public_asset_count: publicAssetCountMap[p.id] ?? 0,
        }));

      setProfiles(enriched);
    } catch (error) {
      console.error("Error loading profiles:", error);
    } finally {
      setLoading(false);
    }
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (creditFilter !== "all") count++;
    if (joinedFilter !== "all") count++;
    if (communityRole !== "all") count++;
    if (profileFilter !== "all") count++;
    if (stripeFilter !== "all") count++;
    if (activityFilter !== "all") count++;
    if (sortField !== "created_at" || sortOrder !== "desc") count++;
    return count;
  }, [
    creditFilter,
    joinedFilter,
    communityRole,
    profileFilter,
    stripeFilter,
    activityFilter,
    sortField,
    sortOrder,
  ]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setCreditFilter("all");
    setJoinedFilter("all");
    setCommunityRole("all");
    setProfileFilter("all");
    setStripeFilter("all");
    setActivityFilter("all");
    setSortField("created_at");
    setSortOrder("desc");
  };

  async function toggleBan(profileId: string, currentBanned: boolean) {
    setBanLoading(profileId);
    try {
      await supabase
        .from("profiles")
        .update({ is_banned: !currentBanned })
        .eq("id", profileId);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profileId ? { ...p, is_banned: !currentBanned } : p,
        ),
      );
    } catch {
      // silent
    } finally {
      setBanLoading(null);
    }
  }

  const filteredProfiles = useMemo(() => {
    let result = [...profiles];

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.display_name?.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          p.bio?.toLowerCase().includes(term),
      );
    }

    // Credit filter
    if (creditFilter === "has_credits")
      result = result.filter((p) => (p.credit_balance ?? 0) > 0);
    else if (creditFilter === "no_credits")
      result = result.filter((p) => (p.credit_balance ?? 0) === 0);
    else if (creditFilter === "above_100")
      result = result.filter((p) => (p.credit_balance ?? 0) >= 100);
    else if (creditFilter === "above_500")
      result = result.filter((p) => (p.credit_balance ?? 0) >= 500);
    else if (creditFilter === "above_1000")
      result = result.filter((p) => (p.credit_balance ?? 0) >= 1000);

    // Joined filter
    if (joinedFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      if (joinedFilter === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (joinedFilter === "7days") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (joinedFilter === "30days") {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (joinedFilter === "90days") {
        cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getFullYear(), 0, 1);
      }
      result = result.filter((p) => new Date(p.created_at) >= cutoff);
    }

    // Community role
    if (communityRole !== "all") {
      result = result.filter((p) =>
        communityRole === "creator"
          ? p.community_role === "creator"
          : p.community_role !== "creator",
      );
    }

    // Profile completeness
    if (profileFilter === "has_avatar")
      result = result.filter((p) => !!p.avatar_url);
    else if (profileFilter === "no_avatar")
      result = result.filter((p) => !p.avatar_url);
    else if (profileFilter === "has_bio")
      result = result.filter((p) => !!p.bio);
    else if (profileFilter === "no_bio") result = result.filter((p) => !p.bio);
    else if (profileFilter === "has_socials")
      result = result.filter(
        (p) => p.twitter_url || p.linkedin_url || p.website_url,
      );
    else if (profileFilter === "no_socials")
      result = result.filter(
        (p) => !p.twitter_url && !p.linkedin_url && !p.website_url,
      );

    // Stripe status
    if (stripeFilter === "connected")
      result = result.filter((p) => p.stripe_onboarding_status === "completed");
    else if (stripeFilter === "pending")
      result = result.filter((p) => p.stripe_onboarding_status === "pending");
    else if (stripeFilter === "not_connected")
      result = result.filter((p) => !p.stripe_onboarding_status);

    // Activity
    if (activityFilter === "has_assets")
      result = result.filter((p) => (p.asset_count ?? 0) > 0);
    else if (activityFilter === "has_public")
      result = result.filter((p) => (p.public_asset_count ?? 0) > 0);
    else if (activityFilter === "no_activity")
      result = result.filter((p) => (p.asset_count ?? 0) === 0);

    // Sort
    result.sort((a, b) => {
      let valA: any, valB: any;
      if (sortField === "created_at") {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortField === "display_name") {
        valA = (a.display_name || "").toLowerCase();
        valB = (b.display_name || "").toLowerCase();
      } else if (sortField === "credit_balance") {
        valA = a.credit_balance ?? 0;
        valB = b.credit_balance ?? 0;
      } else if (sortField === "asset_count") {
        valA = a.asset_count ?? 0;
        valB = b.asset_count ?? 0;
      } else if (sortField === "public_asset_count") {
        valA = a.public_asset_count ?? 0;
        valB = b.public_asset_count ?? 0;
      }
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    profiles,
    searchTerm,
    creditFilter,
    joinedFilter,
    communityRole,
    profileFilter,
    stripeFilter,
    activityFilter,
    sortField,
    sortOrder,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    creditFilter,
    joinedFilter,
    communityRole,
    profileFilter,
    stripeFilter,
    activityFilter,
    sortField,
    sortOrder,
  ]);

  const totalPages = Math.ceil(filteredProfiles.length / PAGE_SIZE);
  const paginatedProfiles = filteredProfiles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      for (
        let i = Math.max(2, currentPage - 1);
        i <= Math.min(totalPages - 1, currentPage + 1);
        i++
      ) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const selectClass =
    "bg-white/5 border border-white/10 text-sm px-3 py-1.5 focus:outline-none focus:border-white/20 text-gray-300 cursor-pointer appearance-none";

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-light mb-6">Users</h1>
        <div className="border border-white/10 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <AssetsTableSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef} className="-mt-17 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light mb-1">Users</h1>
          <p className="text-sm text-gray-400">
            {filteredProfiles.length} of {profiles.length} users
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLoading(true);
              loadProfiles();
            }}
            className="p-2 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
            title="Refresh"
          >
            <ArrowsClockwise size={18} weight="bold" />
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border transition-all text-sm cursor-pointer ${
              showFilters || activeFilterCount > 0
                ? "bg-red-500/20 text-red-400 border-red-500/30"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-gray-400"
            }`}
          >
            <FunnelSimple size={18} weight="bold" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs rounded-full px-1.5">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <MagnifyingGlass
            size={20}
            weight="duotone"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by name, ID, or bio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border border-white/10 bg-white/[0.02] p-4 mb-4 space-y-4">
          {/* Row 1: Credit & Joined & Community Role */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">
                Credits
              </label>
              <select
                value={creditFilter}
                onChange={(e) =>
                  setCreditFilter(e.target.value as CreditFilter)
                }
                className={selectClass + " w-full"}
              >
                <option value="all">All</option>
                <option value="has_credits">Has Credits</option>
                <option value="no_credits">No Credits</option>
                <option value="above_100">100+</option>
                <option value="above_500">500+</option>
                <option value="above_1000">1,000+</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">
                Joined
              </label>
              <select
                value={joinedFilter}
                onChange={(e) =>
                  setJoinedFilter(e.target.value as JoinedFilter)
                }
                className={selectClass + " w-full"}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="this_year">This Year</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">
                Community Role
              </label>
              <select
                value={communityRole}
                onChange={(e) => setCommunityRole(e.target.value)}
                className={selectClass + " w-full"}
              >
                <option value="all">All</option>
                <option value="creator">Creators</option>
                <option value="non_creator">Non-Creators</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">
                Profile
              </label>
              <select
                value={profileFilter}
                onChange={(e) =>
                  setProfileFilter(e.target.value as ProfileFilter)
                }
                className={selectClass + " w-full"}
              >
                <option value="all">All</option>
                <option value="has_avatar">Has Avatar</option>
                <option value="no_avatar">No Avatar</option>
                <option value="has_bio">Has Bio</option>
                <option value="no_bio">No Bio</option>
                <option value="has_socials">Has Socials</option>
                <option value="no_socials">No Socials</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">
                Stripe
              </label>
              <select
                value={stripeFilter}
                onChange={(e) =>
                  setStripeFilter(e.target.value as StripeFilter)
                }
                className={selectClass + " w-full"}
              >
                <option value="all">All</option>
                <option value="connected">Connected</option>
                <option value="pending">Pending</option>
                <option value="not_connected">Not Connected</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">
                Activity
              </label>
              <select
                value={activityFilter}
                onChange={(e) =>
                  setActivityFilter(e.target.value as ActivityFilter)
                }
                className={selectClass + " w-full"}
              >
                <option value="all">All</option>
                <option value="has_assets">Has Assets</option>
                <option value="has_public">Has Public Assets</option>
                <option value="no_activity">No Activity</option>
              </select>
            </div>
          </div>

          {/* Row 2: Sort & Clear */}
          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Sort by
              </label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className={selectClass}
              >
                <option value="created_at">Joined Date</option>
                <option value="display_name">Name</option>
                <option value="credit_balance">Credits</option>
                <option value="asset_count">Assets</option>
                <option value="public_asset_count">Public Assets</option>
              </select>
              <button
                onClick={() =>
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                }
                className="p-1.5 hover:bg-white/10 transition-colors cursor-pointer text-gray-400 border border-white/10"
                title={sortOrder === "asc" ? "Ascending" : "Descending"}
              >
                {sortOrder === "asc" ? (
                  <SortAscending size={18} weight="bold" />
                ) : (
                  <SortDescending size={18} weight="bold" />
                )}
              </button>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                <X size={14} weight="bold" />
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active filter tags */}
      {!showFilters && activeFilterCount > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {creditFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              Credits: {creditFilter.replace("_", " ")}
              <button
                onClick={() => setCreditFilter("all")}
                className="cursor-pointer hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {joinedFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              Joined: {joinedFilter.replace("_", " ")}
              <button
                onClick={() => setJoinedFilter("all")}
                className="cursor-pointer hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {communityRole !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              Role: {communityRole}
              <button
                onClick={() => setCommunityRole("all")}
                className="cursor-pointer hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {profileFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              Profile: {profileFilter.replace("_", " ")}
              <button
                onClick={() => setProfileFilter("all")}
                className="cursor-pointer hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {stripeFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              Stripe: {stripeFilter.replace("_", " ")}
              <button
                onClick={() => setStripeFilter("all")}
                className="cursor-pointer hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {activityFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              Activity: {activityFilter.replace("_", " ")}
              <button
                onClick={() => setActivityFilter("all")}
                className="cursor-pointer hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 sticky top-0">
            <tr className="text-left text-gray-400">
              <th className="p-3">User</th>
              <th className="p-3">Credits</th>
              <th className="p-3">Assets</th>
              <th className="p-3">Public</th>
              <th className="p-3">Stripe</th>
              <th className="p-3">Joined</th>
              <th className="p-3">Access</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProfiles.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  No users found matching your filters
                </td>
              </tr>
            ) : (
              paginatedProfiles.map((profile) => (
                <tr
                  key={profile.id}
                  onClick={() => router.push(`/superadmin/users/${profile.id}`)}
                  className="border-t border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {/* User */}
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.display_name || "User"}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <User
                            size={20}
                            weight="duotone"
                            className="text-gray-500"
                          />
                        </div>
                      )}
                      <div>
                        <div className="font-light flex items-center gap-2">
                          {profile.display_name || "—"}
                          {profile.community_role === "creator" && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase tracking-wider">
                              Creator
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 font-mono">
                          {profile.id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Credits */}
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <Lightning
                        size={14}
                        className="text-red-500"
                        weight="fill"
                      />
                      <span
                        className={`text-sm font-semibold ${
                          (profile.credit_balance ?? 0) > 0
                            ? "text-white"
                            : "text-gray-600"
                        }`}
                      >
                        {(profile.credit_balance ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </td>

                  {/* Assets */}
                  <td className="p-3 text-sm text-gray-400">
                    {(profile.asset_count ?? 0).toLocaleString()}
                  </td>

                  {/* Public Assets */}
                  <td className="p-3 text-sm text-gray-400">
                    {(profile.public_asset_count ?? 0).toLocaleString()}
                  </td>

                  {/* Stripe */}
                  <td className="p-3">
                    {profile.stripe_onboarding_status === "completed" ? (
                      <span className="px-2 py-1 text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                        Connected
                      </span>
                    ) : profile.stripe_onboarding_status === "pending" ? (
                      <span className="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        Pending
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td className="p-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} weight="duotone" />
                      {new Date(profile.created_at).toLocaleDateString()}
                    </div>
                  </td>

                  {/* Access */}
                  <td className="p-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBan(profile.id, profile.is_banned);
                      }}
                      disabled={banLoading === profile.id}
                      className="relative cursor-pointer disabled:opacity-50"
                      title={
                        profile.is_banned
                          ? "Banned — click to unban"
                          : "Active — click to ban"
                      }
                    >
                      <div
                        className={`w-8 h-[18px] rounded-full transition-colors duration-300 ${
                          !profile.is_banned ? "bg-green-500" : "bg-red-500"
                        }`}
                      >
                        <div
                          className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all duration-300 ${
                            !profile.is_banned ? "left-[17px]" : "left-[3px]"
                          }`}
                        />
                      </div>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-gray-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filteredProfiles.length)} of{" "}
            {filteredProfiles.length}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); topRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={currentPage === 1}
              className="p-2 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <CaretLeft size={16} />
            </button>

            {getPageNumbers().map((page, i) =>
              typeof page === "string" ? (
                <span key={`dots-${i}`} className="px-2 text-gray-600">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => { setCurrentPage(page); topRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                  className={`min-w-[32px] h-8 px-2 transition-colors cursor-pointer ${
                    currentPage === page
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "hover:bg-white/10 text-gray-400 border border-transparent"
                  }`}
                >
                  {page}
                </button>
              ),
            )}

            <button
              onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); topRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={currentPage === totalPages}
              className="p-2 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <CaretRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
