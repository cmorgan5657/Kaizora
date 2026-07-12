"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2,
  Activity,
  Zap,
  PauseCircle,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityRow {
  id: string;
  agent_type: "pricing" | "feature" | "unfeature";
  output: {
    action: string;
    confidence?: "HIGH" | "MEDIUM" | "LOW";
  };
  explanation?: string | null;
  review_action: "APPROVED" | "REJECTED" | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  assets: {
    title: string;
  }[];
}

export default function AIActivityPage() {
  const PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [stats, setStats] = useState<{
    suggestionsToday: number;
    autoActionsToday: number;
    pausedAssets: number;
  } | null>(null);

  useEffect(() => {
    loadActivity();
    loadStats();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activity]);

  async function loadStats() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: suggestionsToday },
      { count: autoActionsToday },
      { count: pausedAssets },
    ] = await Promise.all([
      supabase
        .from("agent_decisions")
        .select("*, assets!inner(owner_id)", { count: "exact", head: true })
        .eq("assets.owner_id", user.id)
        .gte("created_at", since)
        .is("review_action", null),

      supabase
        .from("agent_decisions")
        .select("*, assets!inner(owner_id)", { count: "exact", head: true })
        .eq("assets.owner_id", user.id)
        .gte("reviewed_at", since)
        .is("reviewed_by", null),

      supabase
        .from("assets")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .gt("manual_override_until", new Date().toISOString()),
    ]);

    setStats({
      suggestionsToday: suggestionsToday ?? 0,
      autoActionsToday: autoActionsToday ?? 0,
      pausedAssets: pausedAssets ?? 0,
    });
  }

  async function loadActivity() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("agent_decisions")
      .select(
        `
      id,
      agent_type,
      output,
      explanation,
      review_action,
      reviewed_by,
      reviewed_at,
      created_at,
      assets!inner (
        title,
        owner_id
      )
    `
      )
      .eq("assets.owner_id", user.id)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error) {
      setActivity((data as ActivityRow[]) || []);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-4 md:py-8 px-2 md:px-4 relative">
        <Skeleton className="h-7 md:h-10 w-36 md:w-48 bg-white/10 mb-2 md:mb-4" />
        <Skeleton className="h-3 md:h-4 w-64 md:w-96 bg-white/10 mb-4 md:mb-8" />

        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10"
            >
              <Skeleton className="h-3 w-20 md:w-32 bg-white/10 mb-2 md:mb-3" />
              <Skeleton className="h-6 md:h-8 w-12 md:w-16 bg-white/10" />
            </div>
          ))}
        </div>

        <div className="space-y-2 md:space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10"
            >
              <Skeleton className="h-4 md:h-5 w-36 md:w-48 bg-white/10 mb-2 md:mb-3" />
              <Skeleton className="h-3 w-full bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-4 md:py-8 px-2 md:px-4 relative">
      {/* Background gradient orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none animate-pulse -z-10" />

      {/* Header */}
      <div className="mb-6 md:mb-12">
        <h1 className="text-xl md:text-5xl font-extralight mb-1 md:mb-3 tracking-tight">
          <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
            AI Activity Log
          </span>
        </h1>
        <p className="text-gray-400 text-xs md:text-base font-light">
          Track all AI agent actions and decisions across your assets
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8">
          {/* Suggestions Today */}
          <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <p className="text-[10px] md:text-xs text-gray-400 font-light uppercase tracking-wider">
                  Suggestions
                </p>
                <Activity className="w-3 h-3 md:w-4 md:h-4 text-red-400" />
              </div>
              <p className="text-lg md:text-3xl font-extralight text-white">
                {stats.suggestionsToday}
              </p>
            </div>
          </div>

          {/* Auto Actions */}
          <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10 hover:border-green-500/50 transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-green-500 to-green-600 group-hover:w-full transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <p className="text-[10px] md:text-xs text-gray-400 font-light uppercase tracking-wider">
                  Auto Actions
                </p>
                <Zap className="w-3 h-3 md:w-4 md:h-4 text-green-400" />
              </div>
              <p className="text-lg md:text-3xl font-extralight text-green-400">
                {stats.autoActionsToday}
              </p>
            </div>
          </div>

          {/* Paused Assets */}
          <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10 hover:border-yellow-500/50 transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-yellow-500 to-yellow-600 group-hover:w-full transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <p className="text-[10px] md:text-xs text-gray-400 font-light uppercase tracking-wider">
                  AI Paused
                </p>
                <PauseCircle className="w-3 h-3 md:w-4 md:h-4 text-yellow-400" />
              </div>
              <p className="text-lg md:text-3xl font-extralight text-yellow-400">
                {stats.pausedAssets}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {activity.length === 0 ? (
        <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-8 md:p-12 border border-white/10 text-center">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-red-500 to-red-600 opacity-50" />
          <Activity className="w-8 h-8 md:w-12 md:h-12 text-gray-600 mx-auto mb-3 md:mb-4" />
          <p className="text-gray-400 text-xs md:text-base font-light">
            No AI activity recorded yet.
          </p>
          <p className="text-[10px] md:text-xs text-gray-500 font-light mt-1 md:mt-2">
            Agent actions will appear here as they occur.
          </p>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {activity.slice(0, visibleCount).map((row) => {
            const isAuto =
              row.review_action === "APPROVED" && row.reviewed_by === null;

            const getStatusBadge = () => {
              if (row.review_action === null) {
                return (
                  <span className="px-2 md:px-3 py-0.5 md:py-1 bg-gray-500/20 border border-gray-500/30 text-gray-400 text-[10px] md:text-xs font-light flex items-center gap-1 md:gap-1.5">
                    <Clock className="w-3 h-3" />
                    Pending
                  </span>
                );
              }

              if (row.review_action === "APPROVED") {
                return (
                  <span
                    className={`px-2 md:px-3 py-0.5 md:py-1 border text-[10px] md:text-xs font-light flex items-center gap-1 md:gap-1.5 ${
                      isAuto
                        ? "bg-green-500/20 border-green-500/30 text-green-400"
                        : "bg-blue-500/20 border-blue-500/30 text-blue-400"
                    }`}
                  >
                    {isAuto ? (
                      <>
                        <Zap className="w-3 h-3" />
                        AUTO
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3 h-3" />
                        Approved
                      </>
                    )}
                  </span>
                );
              }

              if (row.review_action === "REJECTED") {
                return (
                  <span className="px-2 md:px-3 py-0.5 md:py-1 bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] md:text-xs font-light flex items-center gap-1 md:gap-1.5">
                    <XCircle className="w-3 h-3" />
                    Rejected
                  </span>
                );
              }
            };

            const getConfidenceColor = (confidence?: string) => {
              if (!confidence) return "text-gray-400";
              switch (confidence) {
                case "HIGH":
                  return "text-green-400";
                case "MEDIUM":
                  return "text-yellow-400";
                case "LOW":
                  return "text-red-400";
                default:
                  return "text-gray-400";
              }
            };

            return (
              <div
                key={row.id}
                className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10 flex gap-2 md:gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Asset Title */}
                    <h3 className="text-white text-xs md:text-base font-light mb-1 md:mb-2 truncate">
                      {row.assets[0]?.title}
                    </h3>

                    {/* Action Details */}
                    <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3 flex-wrap">
                      <span className="text-[10px] md:text-xs text-gray-400 font-light">
                        {row.agent_type.toUpperCase()}
                      </span>
                      <span className="text-gray-600">→</span>
                      <span className="text-[10px] md:text-xs text-white font-medium">
                        {row.output.action}
                      </span>
                      {row.output.confidence && (
                        <>
                          <span className="text-gray-600">·</span>
                          <span
                            className={`text-xs font-light ${getConfidenceColor(
                              row.output.confidence
                            )}`}
                          >
                            {row.output.confidence}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Explanation */}
                    {row.explanation && (
                      <div className="p-2 md:p-3 bg-black/40 backdrop-blur-sm border border-red-500/20 mb-2 md:mb-3">
                        <p className="text-[10px] md:text-xs text-gray-400 font-light leading-relaxed line-clamp-3 md:line-clamp-none">
                          <span className="text-gray-500">Why:</span>{" "}
                          {row.explanation}
                        </p>
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-[10px] md:text-xs text-gray-500 font-light flex items-center gap-1 md:gap-1.5">
                      <Clock className="w-3 h-3" />
                      {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-start">{getStatusBadge()}</div>
                </div>
              </div>
            );
          })}

          {visibleCount < activity.length && (
            <div className="pt-2 md:pt-3 flex justify-center">
              <button
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="px-4 md:px-5 py-2 border border-white/10 text-xs md:text-sm font-light text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
