"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  Star,
  StarOff,
  Clock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Suggestion {
  id: string;
  asset_id: string;
  agent_type: "pricing" | "feature" | "unfeature";
  output: {
    action: "INCREASE" | "DECREASE" | "FEATURE" | "UNFEATURE" | "HOLD";
    score?: number;
    confidence?: "HIGH" | "MEDIUM" | "LOW";
  };
  explanation?: string;
  created_at: string;
  assets: {
    title: string;
    price_cents?: number;
    featured?: boolean;
    last_agent_action?: string | null;
    manual_override_until?: string | null;
  };
}

export default function AISuggestionsPage() {
  const PAGE_SIZE = 8;
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    loadSuggestions();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [suggestions]);

  async function loadSuggestions() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("agent_decisions")
      .select(
        `
        id,
        asset_id,
        agent_type,
        output,
        explanation,
        created_at,
        assets!inner (
          title,
          price_cents,
          featured,
          owner_id,
          last_agent_action,
          manual_override_until
        )
      `
      )
      .eq("assets.owner_id", user.id)
      .is("review_action", null)
      .neq("output->>action", "HOLD")
      .order("created_at", { ascending: false });

    setSuggestions((data as any) || []);
    setLoading(false);
  }

  async function applySuggestionEffect(s: Suggestion, userId: string) {
    if (s.agent_type === "pricing" && s.assets.price_cents) {
      const factor = s.output.action === "INCREASE" ? 1.1 : 0.9;
      const newPrice = Math.round(s.assets.price_cents * factor);

      await supabase
        .from("assets")
        .update({
          price_cents: newPrice,
          last_agent_action: "PRICE_UPDATED",
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", s.asset_id);
    }

    if (s.agent_type === "feature") {
      await supabase
        .from("assets")
        .update({
          featured: true,
          last_agent_action: "FEATURED",
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", s.asset_id);
    }

    if (s.agent_type === "unfeature") {
      await supabase
        .from("assets")
        .update({
          featured: false,
          last_agent_action: "UNFEATURED",
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", s.asset_id);
    }

    await supabase
      .from("agent_decisions")
      .update({
        review_action: "APPROVED",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", s.id);
  }

  async function approveSuggestion(s: Suggestion, reload = true) {
    setUpdatingId(s.id);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (s.agent_type === "pricing" && s.assets.price_cents) {
      const factor = s.output.action === "INCREASE" ? 1.1 : 0.9;
      const newPrice = Math.round(s.assets.price_cents * factor);

      await supabase
        .from("assets")
        .update({
          price_cents: newPrice,
          last_agent_action: "PRICE_UPDATED",
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", s.asset_id);
    }

    if (s.agent_type === "feature") {
      await supabase
        .from("assets")
        .update({
          featured: true,
          last_agent_action: "FEATURED",
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", s.asset_id);
    }

    if (s.agent_type === "unfeature") {
      await supabase
        .from("assets")
        .update({
          featured: false,
          last_agent_action: "UNFEATURED",
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", s.asset_id);
    }

    await supabase
      .from("agent_decisions")
      .update({
        review_action: "APPROVED",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", s.id);

    setUpdatingId(null);
    if (reload) loadSuggestions();
  }

  async function rejectSuggestion(id: string) {
    setUpdatingId(id);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: decision } = await supabase
      .from("agent_decisions")
      .select("asset_id")
      .eq("id", id)
      .single();

    if (decision?.asset_id) {
      await supabase
        .from("assets")
        .update({
          manual_override_until: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", decision.asset_id);
    }

    await supabase
      .from("agent_decisions")
      .update({
        review_action: "REJECTED",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    setUpdatingId(null);
    loadSuggestions();
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-4 md:py-8 px-2 md:px-4 relative">
        <Skeleton className="h-10 w-64 bg-white/10 mb-4" />
        <Skeleton className="h-4 w-96 bg-white/10 mb-8" />
        <Skeleton className="h-8 w-32 bg-white/10 mb-6" />

        <div className="space-y-2 md:space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10"
            >
              <Skeleton className="h-5 w-48 bg-white/10 mb-3" />
              <Skeleton className="h-3 w-full bg-white/10 mb-2" />
              <Skeleton className="h-3 w-64 bg-white/10" />
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
        <h1 className="text-xl md:text-5xl font-extralight mb-3 tracking-tight">
          <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
            AI Suggested Changes
          </span>
        </h1>
        <p className="text-gray-400 text-xs md:text-base font-light">
          Review and approve AI-powered recommendations for your assets
        </p>
      </div>

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="mb-4 md:mb-8 text-xs text-gray-400 hover:text-red-400 transition-colors font-light flex items-center gap-2 group"
      >
        <Clock className="w-3 h-3 group-hover:rotate-12 transition-transform" />
        {showHistory ? "Hide" : "View"} Decision History
      </button>

      {suggestions.length === 0 ? (
        <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-8 md:p-12 border border-white/10 text-center">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-red-500 to-red-600 opacity-50" />
          <p className="text-gray-400 text-xs md:text-base font-light">
            No pending suggestions at the moment.
          </p>
          <p className="text-[10px] md:text-xs text-gray-500 font-light mt-2">
            AI agents will notify you when optimizations are available.
          </p>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-4">
          {suggestions.slice(0, visibleCount).map((s) => {
            const nextPrice =
              s.agent_type === "pricing" && s.assets.price_cents
                ? Math.round(
                    s.assets.price_cents *
                      (s.output.action === "INCREASE" ? 1.1 : 0.9)
                  )
                : null;

            const getActionIcon = () => {
              if (s.agent_type === "pricing") {
                return s.output.action === "INCREASE" ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                );
              }
              if (s.agent_type === "feature")
                return <Star className="w-4 h-4 text-yellow-400" />;
              if (s.agent_type === "unfeature")
                return <StarOff className="w-4 h-4 text-gray-400" />;
            };

            const getConfidenceBadge = () => {
              if (!s.output.confidence) return null;
              const colors = {
                HIGH: "bg-green-500/20 text-green-400 border-green-500/30",
                MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                LOW: "bg-gray-500/20 text-gray-400 border-gray-500/30",
              };
              return (
                <span
                  className={`px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs border font-light ${
                    colors[s.output.confidence]
                  }`}
                >
                  {s.output.confidence}
                </span>
              );
            };

            return (
              <div
                key={s.id}
                className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group"
              >
                {/* Top accent line */}
                <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />

                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10 flex gap-2 md:gap-4">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? [...prev, s.id]
                          : prev.filter((id) => id !== s.id)
                      )
                    }
                    className="mt-1 w-4 h-4 bg-white/5 border-white/20 rounded accent-red-500 cursor-pointer"
                  />

                  {/* Content */}
                  <div className="flex-1">
                    {/* Asset Title */}
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-white text-xs md:text-base font-light">
                        {s.assets.title}
                      </h3>
                      {getConfidenceBadge()}
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {s.assets.last_agent_action && (
                        <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-white/5 border border-white/10 text-[10px] md:text-xs text-gray-400 font-light">
                          Last: {s.assets.last_agent_action}
                        </span>
                      )}
                      {s.assets.manual_override_until && (
                        <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-yellow-500/10 border border-yellow-500/30 text-[10px] md:text-xs text-yellow-400 font-light flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          AI paused until{" "}
                          {new Date(
                            s.assets.manual_override_until
                          ).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Action Type */}
                    <div className="flex items-center gap-2 mb-3">
                      {getActionIcon()}
                      <span className="text-xs text-gray-400 font-light">
                        {s.agent_type.toUpperCase()} →{" "}
                        <span className="text-white font-medium">
                          {s.output.action}
                        </span>
                        {s.output.score !== undefined && (
                          <span className="text-gray-500">
                            {" "}
                            · Score {s.output.score}/10
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Preview Changes */}
                    <div className="p-2 md:p-3 bg-black/40 backdrop-blur-sm border border-red-500/20 mb-3">
                      {s.agent_type === "pricing" && s.assets.price_cents && (
                        <p className="text-xs font-light">
                          <span className="text-gray-400">Price:</span>{" "}
                          <span className="text-gray-300">
                            ₹{s.assets.price_cents / 100}
                          </span>
                          <span className="text-gray-500 mx-2">→</span>
                          <span className="text-red-400 font-medium">
                            ₹{(nextPrice || 0) / 100}
                          </span>
                        </p>
                      )}

                      {s.agent_type === "feature" && (
                        <p className="text-xs font-light">
                          <span className="text-gray-400">Featured:</span>{" "}
                          <span className="text-red-400">No</span>
                          <span className="text-gray-500 mx-2">→</span>
                          <span className="text-green-400 font-medium">
                            Yes
                          </span>
                        </p>
                      )}

                      {s.agent_type === "unfeature" && (
                        <p className="text-xs font-light">
                          <span className="text-gray-400">Featured:</span>{" "}
                          <span className="text-green-400">Yes</span>
                          <span className="text-gray-500 mx-2">→</span>
                          <span className="text-red-400 font-medium">No</span>
                        </p>
                      )}
                    </div>

                    {/* Explanation */}
                    {s.explanation && (
                      <p className="text-[10px] md:text-xs text-gray-400 font-light leading-relaxed">
                        <span className="text-gray-500">Why:</span>{" "}
                        {s.explanation}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      disabled={updatingId === s.id}
                      onClick={() => approveSuggestion(s)}
                      className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-green-600 to-green-700 text-white text-[10px] md:text-xs font-light hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updatingId === s.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Approve
                    </button>

                    <button
                      disabled={updatingId === s.id}
                      onClick={() => rejectSuggestion(s.id)}
                      className="px-3 md:px-4 py-1.5 md:py-2 border border-red-500/50 text-red-400 text-[10px] md:text-xs font-light hover:bg-red-500/10 hover:border-red-500 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {visibleCount < suggestions.length && (
            <div className="pt-2 flex justify-center">
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

      {showHistory && <DecisionHistory />}
    </div>
  );
}

function DecisionHistory() {
  const PAGE_SIZE = 10;
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    supabase
      .from("agent_decisions")
      .select(
        `
        id,
        agent_type,
        output,
        review_action,
        reviewed_at,
        assets!inner (
          title,
          last_agent_action,
          manual_override_until
        )
      `
      )
      .not("review_action", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setHistory(data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [history]);

  if (loading) {
    return (
      <div className="mt-8 space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-white/10" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-12">
      <h2 className="text-lg md:text-2xl font-extralight mb-3 md:mb-6 text-gray-300">
        Recent Decisions
      </h2>
      <div className="space-y-3">
        {history.slice(0, visibleCount).map((h) => (
          <div
            key={h.id}
            className="relative bg-gradient-to-br from-zinc-900/60 to-black/60 backdrop-blur-xl p-3 md:p-4 border border-white/5 hover:border-white/10 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-light text-white mb-1">
                  {h.assets.title}
                </p>
                <p className="text-xs text-gray-400 font-light">
                  <span className="text-gray-500">{h.output.action}</span>
                  <span className="mx-2">·</span>
                  <span
                    className={
                      h.review_action === "APPROVED"
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {h.review_action}
                  </span>
                  {h.assets.last_agent_action && (
                    <>
                      <span className="mx-2">·</span>
                      <span className="text-gray-500">
                        {h.assets.last_agent_action}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <span className="text-xs text-gray-500 font-light">
                {new Date(h.reviewed_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}

        {visibleCount < history.length && (
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="px-4 md:px-5 py-2 border border-white/10 text-xs md:text-sm font-light text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
