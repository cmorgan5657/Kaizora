"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  Brain,
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  ChartBar,
  Coins,
  Lightning,
  Sparkle,
  X,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowsDownUp,
  ArrowSquareOut,
  Copy,
  Check,
} from "phosphor-react";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

type UsageLog = {
  id: string;
  user_id: string | null;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  created_at: string;
};

type SortKey = "date_desc" | "date_asc" | "cost_desc" | "cost_asc" | "tokens_desc" | "tokens_asc";
type ViewTab = "overview" | "per_user" | "by_model" | "by_page";
type CSVValue = string | number | boolean | null | undefined;
type ChartTooltipParam = { name: string; value: number | string; marker?: string; color?: string; dataIndex?: number };

// Map every feature to a "page" (where in the app the cost was incurred)
const FEATURE_TO_PAGE: Record<string, string> = {
  // Moderation
  moderation: "moderation",
  // Decision Layer
  decision_layer_image: "decision_layer",
  decision_layer_video: "decision_layer",
  decision_layer_audio: "decision_layer",
  decision_layer_text: "decision_layer",
  decision_layer_agent_chat: "decision_layer",
  decision_layer_greeting: "decision_layer",
  decision_layer_tts: "decision_layer",
  // Marketplace analysis
  marketplace_analyze_image: "marketplace_analyze",
  marketplace_analyze_video: "marketplace_analyze",
  marketplace_analyze_audio: "marketplace_analyze",
  marketplace_analyze_text: "marketplace_analyze",
  marketplace_bundles_suggest: "marketplace_analyze",
  analyze_assets: "marketplace_analyze",
  analyze_asset: "marketplace_analyze",
  analyze_asset_pdf: "marketplace_analyze",
  // Remix Studio
  remix_generation: "remix_studio",
  ai_generate: "remix_studio",
  ai_reverse: "remix_studio",
  ai_suggest: "remix_studio",
  ai_generate_vision: "remix_studio",
  ai_generate_enhance: "remix_studio",
  generation: "remix_studio",
  // Commerce agents
  pricing_agent: "commerce_agents",
  packaging_agent: "commerce_agents",
  merchandising_agent: "commerce_agents",
  catalog_strategy_agent: "commerce_agents",
  search_optimization_agent: "commerce_agents",
  bundle_search_optimization_agent: "commerce_agents",
  commerce_intake: "commerce_agents",
  feature_asset_agent: "commerce_agents",
  // Assistants (chat)
  community_assistant: "assistants",
  marketplace_assistant: "assistants",
  asset_assistant: "assistants",
  creator_agent: "assistants",
  // Background batch agents
  bundling_batch_agent: "batch_agents",
  post_launch_optimizer: "batch_agents",
  post_launch_batch_agent: "batch_agents",
  bundles_auto_create: "batch_agents",
  bulk_categorize: "batch_agents",
  bulk_categorize_script: "batch_agents",
};

const PAGE_LABELS: Record<string, { name: string; color: string; bg: string; icon: string }> = {
  moderation: { name: "Moderation", color: "#ef4444", bg: "bg-red-500/15", icon: "🛡️" },
  decision_layer: { name: "Decision Layer", color: "#a78bfa", bg: "bg-violet-500/15", icon: "🧠" },
  marketplace_analyze: { name: "Marketplace Analyze", color: "#ec4899", bg: "bg-pink-500/15", icon: "🔍" },
  remix_studio: { name: "Remix Studio", color: "#f97316", bg: "bg-orange-500/15", icon: "🎨" },
  commerce_agents: { name: "Commerce Agents", color: "#10b981", bg: "bg-emerald-500/15", icon: "💼" },
  assistants: { name: "Chat Assistants", color: "#38bdf8", bg: "bg-sky-500/15", icon: "💬" },
  batch_agents: { name: "Background Agents", color: "#a3e635", bg: "bg-lime-500/15", icon: "⚙️" },
  other: { name: "Other", color: "#9ca3af", bg: "bg-gray-500/15", icon: "📌" },
};

function pageForFeature(feature: string): string {
  return FEATURE_TO_PAGE[feature] || "other";
}

type ProviderKey = "gemini" | "fal" | "replicate" | "elevenlabs";

const MODEL_LABELS: Record<string, { name: string; provider: ProviderKey; color: string }> = {
  // Gemini
  "gemini-3.1-flash-lite": { name: "Gemini 3.1 Flash Lite", provider: "gemini", color: "#8b5cf6" },
  "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro Preview", provider: "gemini", color: "#a78bfa" },
  // ElevenLabs
  "eleven_multilingual_v2": { name: "Eleven Multilingual v2", provider: "elevenlabs", color: "#22d3ee" },
  // Fal.ai
  "fal-ai/flux/dev": { name: "Flux Dev", provider: "fal", color: "#ef4444" },
  "fal-ai/flux-pro/v1.1": { name: "Flux 1.1 Pro", provider: "fal", color: "#dc2626" },
  "fal-ai/flux-pro/v1.1-ultra": { name: "Flux 1.1 Pro Ultra", provider: "fal", color: "#b91c1c" },
  "fal-ai/ideogram/v2/turbo": { name: "Ideogram v2 Turbo", provider: "fal", color: "#f97316" },
  "fal-ai/nano-banana-pro": { name: "Nano Banana Pro", provider: "fal", color: "#fb923c" },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { name: "Kling v2.5 Turbo Pro", provider: "fal", color: "#facc15" },
  "fal-ai/minimax/hailuo-02/standard/image-to-video": { name: "MiniMax Hailuo-02", provider: "fal", color: "#eab308" },
  "fal-ai/wan-i2v": { name: "Wan 2.1 i2v", provider: "fal", color: "#84cc16" },
  "bytedance/seedance-2.0/image-to-video": { name: "SeedDance 2.0", provider: "fal", color: "#22c55e" },
  "fal-ai/minimax-music": { name: "MiniMax Music", provider: "fal", color: "#10b981" },
  "fal-ai/stable-audio": { name: "Stable Audio (fal)", provider: "fal", color: "#14b8a6" },
  "fal-ai/demucs": { name: "Demucs", provider: "fal", color: "#06b6d4" },
  // Replicate
  "meta/musicgen": { name: "MusicGen", provider: "replicate", color: "#3b82f6" },
  "suno-ai/bark": { name: "Bark", provider: "replicate", color: "#6366f1" },
  "sakemin/musicgen-remixer": { name: "MusicGen Remixer", provider: "replicate", color: "#818cf8" },
  "sakemin/musicgen-chord": { name: "MusicGen Chord", provider: "replicate", color: "#a78bfa" },
  "resemble-ai/resemble-enhance": { name: "Resemble Enhance", provider: "replicate", color: "#c084fc" },
  "sakemin/audiosr-long-audio": { name: "AudioSR", provider: "replicate", color: "#d946ef" },
  "lucataco/ace-step": { name: "ACE-Step", provider: "replicate", color: "#ec4899" },
  "bytedance/flux-pulid": { name: "Flux PULID", provider: "replicate", color: "#f43f5e" },
  "stability-ai/sdxl": { name: "SDXL", provider: "replicate", color: "#fb7185" },
  "stability-ai/stable-audio": { name: "Stable Audio", provider: "replicate", color: "#fda4af" },
  "nightmareai/real-esrgan": { name: "Real-ESRGAN", provider: "replicate", color: "#fecaca" },
  "luma/modify-video": { name: "Luma Modify Video", provider: "replicate", color: "#f87171" },
  "cjwbw/demucs": { name: "Demucs (Replicate)", provider: "replicate", color: "#dc2626" },
};

function modelMeta(model: string) {
  return MODEL_LABELS[model] || { name: model, provider: (model.includes("gemini") ? "gemini" : model.startsWith("eleven_") ? "elevenlabs" : model.startsWith("fal-ai") || model.startsWith("bytedance/seedance") ? "fal" : "replicate") as ProviderKey, color: "#6b7280" };
}

const PROVIDER_LABELS: Record<string, { name: string; color: string; bg: string }> = {
  gemini: { name: "Gemini", color: "#a78bfa", bg: "bg-violet-500/15" },
  fal: { name: "Fal.ai", color: "#f97316", bg: "bg-orange-500/15" },
  replicate: { name: "Replicate", color: "#3b82f6", bg: "bg-blue-500/15" },
  elevenlabs: { name: "ElevenLabs", color: "#22d3ee", bg: "bg-cyan-500/15" },
};

// Provider billing dashboards — for quick redirect / copy from the pricing menu.
const PROVIDER_DASHBOARDS: Record<string, string> = {
  gemini: "https://aistudio.google.com/usage",
  fal: "https://fal.ai/dashboard/usage-billing",
  replicate: "https://replicate.com/account/billing",
  elevenlabs: "https://elevenlabs.io/app/usage",
};

// Pricing reference for dropdown — shown in the Pricing menu at the top.
interface ModelPriceInfo { price: string; unit: string }
const MODEL_PRICE_INFO: Record<string, ModelPriceInfo> = {
  // Gemini (per-token billing)
  "gemini-3.1-flash-lite": { price: "$0.075 / $0.30", unit: "per 1M input / output tokens" },
  "gemini-3.1-pro-preview": { price: "$1.25 / $10", unit: "per 1M input / output tokens" },
  // ElevenLabs
  "eleven_multilingual_v2": { price: "$0.10", unit: "per 1K characters" },
  // Fal.ai
  "fal-ai/flux/dev": { price: "$0.025", unit: "per megapixel" },
  "fal-ai/flux-pro/v1.1": { price: "$0.05", unit: "per image" },
  "fal-ai/flux-pro/v1.1-ultra": { price: "$0.06", unit: "per image" },
  "fal-ai/ideogram/v2/turbo": { price: "$0.05", unit: "per image" },
  "fal-ai/nano-banana-pro": { price: "$0.0398", unit: "per image" },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { price: "$0.07", unit: "per second" },
  "fal-ai/minimax/hailuo-02/standard/image-to-video": { price: "$0.045", unit: "per second (768p)" },
  "fal-ai/wan-i2v": { price: "$0.05", unit: "per second" },
  "bytedance/seedance-2.0/image-to-video": { price: "$0.3024", unit: "per second (720p)" },
  "fal-ai/minimax-music": { price: "$0.035", unit: "per generation" },
  "fal-ai/stable-audio": { price: "$0.000575", unit: "per compute second" },
  "fal-ai/demucs": { price: "$0.0007", unit: "per second" },
  // Replicate
  "meta/musicgen": { price: "$0.051", unit: "per run (~37s on A100)" },
  "suno-ai/bark": { price: "$0.015", unit: "per run (T4)" },
  "sakemin/musicgen-remixer": { price: "$0.53", unit: "per run (A100)" },
  "sakemin/musicgen-chord": { price: "$0.32", unit: "per run (A100)" },
  "resemble-ai/resemble-enhance": { price: "$0.007", unit: "per run (T4)" },
  "sakemin/audiosr-long-audio": { price: "$0.10", unit: "per run (L40S)" },
  "lucataco/ace-step": { price: "$0.036", unit: "per run (L40S)" },
  "bytedance/flux-pulid": { price: "$0.019", unit: "per run (A100)" },
  "stability-ai/sdxl": { price: "$0.0052", unit: "per run (L40S)" },
  "stability-ai/stable-audio": { price: "~$0.05", unit: "per run (estimate)" },
  "nightmareai/real-esrgan": { price: "$0.002", unit: "per image" },
  "luma/modify-video": { price: "$0.019", unit: "per million output pixels" },
  "cjwbw/demucs": { price: "~$0.02", unit: "per run (estimate)" },
};

const FEATURE_COLORS: Record<string, string> = {
  moderation: "#ef4444",
  decision_layer_image: "#f97316",
  decision_layer_video: "#f59e0b",
  decision_layer_audio: "#22c55e",
  decision_layer_text: "#3b82f6",
  decision_layer_agent_chat: "#8b5cf6",
  decision_layer_tts: "#22d3ee",
  marketplace_analyze_image: "#ec4899",
  marketplace_analyze_video: "#14b8a6",
  marketplace_analyze_audio: "#6366f1",
  marketplace_analyze_text: "#84cc16",
  pricing_agent: "#fb923c",
  packaging_agent: "#a78bfa",
  merchandising_agent: "#fdba74",
  catalog_strategy_agent: "#34d399",
  search_optimization_agent: "#60a5fa",
  bundle_search_optimization_agent: "#c084fc",
  commerce_intake: "#fbbf24",
  community_assistant: "#38bdf8",
  marketplace_assistant: "#4ade80",
  creator_agent: "#fb7185",
  bundling_batch_agent: "#a3e635",
  post_launch_optimizer: "#f472b6",
  post_launch_batch_agent: "#2dd4bf",
  bundles_auto_create: "#818cf8",
  marketplace_bundles_suggest: "#fdba74",
  bulk_categorize: "#86efac",
  bulk_categorize_script: "#67e8f9",
  analyze_asset_pdf: "#fca5a5",
  remix_generation: "#f59e0b",
  ai_generate: "#fbbf24",
  ai_reverse: "#fb923c",
  ai_suggest: "#fb7185",
  ai_generate_vision: "#facc15",
  ai_generate_enhance: "#fde047",
  analyze_assets: "#a3e635",
  analyze_asset: "#84cc16",
  asset_assistant: "#34d399",
  decision_layer_greeting: "#22c55e",
  feature_asset_agent: "#10b981",
  generation: "#f97316",
};

const FEATURE_LABELS: Record<string, string> = {
  moderation: "Moderation",
  decision_layer_image: "DL Image",
  decision_layer_video: "DL Video",
  decision_layer_audio: "DL Audio",
  decision_layer_text: "DL Text",
  decision_layer_agent_chat: "DL Agent Chat",
  decision_layer_tts: "DL Voice TTS",
  marketplace_analyze_image: "MKT Analyze Image",
  marketplace_analyze_video: "MKT Analyze Video",
  marketplace_analyze_audio: "MKT Analyze Audio",
  marketplace_analyze_text: "MKT Analyze Text",
  pricing_agent: "Pricing Agent",
  packaging_agent: "Packaging Agent",
  merchandising_agent: "Merchandising Agent",
  catalog_strategy_agent: "Catalog Strategy",
  search_optimization_agent: "Search Optimization",
  bundle_search_optimization_agent: "Bundle Search Opt",
  commerce_intake: "Commerce Intake",
  community_assistant: "Community Assistant",
  marketplace_assistant: "Marketplace Assistant",
  creator_agent: "Creator Agent",
  bundling_batch_agent: "Bundling Batch",
  post_launch_optimizer: "Post-Launch Optimizer",
  post_launch_batch_agent: "Post-Launch Batch",
  bundles_auto_create: "Bundles Auto-Create",
  marketplace_bundles_suggest: "Bundle Suggest",
  bulk_categorize: "Bulk Categorize",
  bulk_categorize_script: "Bulk Categorize (Script)",
  analyze_asset_pdf: "Asset PDF Analysis",
  remix_generation: "Remix Studio (Generate)",
  ai_generate: "AI Generate",
  ai_reverse: "AI Reverse",
  ai_suggest: "AI Suggest",
  ai_generate_vision: "AI Vision Analysis",
  ai_generate_enhance: "AI Prompt Enhance",
  analyze_assets: "Analyze Assets (Bulk)",
  analyze_asset: "Analyze Asset",
  asset_assistant: "Asset Assistant",
  decision_layer_greeting: "DL Greeting",
  feature_asset_agent: "Feature Asset",
  generation: "Generation",
};

const PAGE_SIZE = 15;

function fmt(n: number) { return n.toLocaleString(); }
function fmtCost(n: number) {
  if (n === 0) return "$0.000000";
  if (n < 0.001) return `$${(n * 1000).toFixed(4)}m`;
  return `$${n.toFixed(4)}`;
}
function fmtCostFull(n: number) { return `$${n.toFixed(6)}`; }
// Compact money for chart axes — avoids the cramped "$0.0000" repetition.
function fmtAxisCost(v: number): string {
  if (v === 0) return "$0";
  if (v >= 1) return `$${v.toFixed(1)}`;
  if (v >= 0.01) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Escape CSV field properly (handles commas, quotes, newlines).
function csvEscape(v: CSVValue): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename: string, rows: CSVValue[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportRawLogs(data: UsageLog[], profiles: Map<string, string>) {
  const header = ["id", "user_id", "user", "feature", "model", "input_tokens", "output_tokens", "total_tokens", "cost_usd", "created_at"];
  const rows: CSVValue[][] = [header];
  for (const l of data) {
    rows.push([
      l.id, l.user_id || "", profiles.get(l.user_id || "") || "system",
      l.feature, l.model, l.input_tokens, l.output_tokens, l.total_tokens,
      l.cost_usd, l.created_at,
    ]);
  }
  downloadCSV(`ai-costs-raw-logs-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function exportPerUser(
  data: UsageLog[],
  profiles: Map<string, string>,
) {
  // Aggregate by user
  const map = new Map<string, { calls: number; tokens: number; cost: number; features: Set<string>; models: Set<string>; lastSeen: string }>();
  for (const l of data) {
    const uid = l.user_id || "__system__";
    if (!map.has(uid)) map.set(uid, { calls: 0, tokens: 0, cost: 0, features: new Set(), models: new Set(), lastSeen: l.created_at });
    const s = map.get(uid)!;
    s.calls++;
    s.tokens += l.total_tokens;
    s.cost += Number(l.cost_usd);
    s.features.add(l.feature);
    s.models.add(l.model);
    if (l.created_at > s.lastSeen) s.lastSeen = l.created_at;
  }
  const rows: CSVValue[][] = [["user_id", "display_name", "calls", "total_tokens", "total_cost_usd", "features_used", "models_used", "last_activity"]];
  Array.from(map.entries())
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([uid, s]) => {
      const name = uid === "__system__" ? "System / Background" : (profiles.get(uid) || uid);
      rows.push([
        uid === "__system__" ? "" : uid,
        name,
        s.calls, s.tokens, s.cost.toFixed(6),
        Array.from(s.features).join("|"),
        Array.from(s.models).join("|"),
        s.lastSeen,
      ]);
    });
  downloadCSV(`ai-costs-per-user-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function exportByModel(data: UsageLog[]) {
  const map = new Map<string, { calls: number; tokens: number; cost: number }>();
  for (const l of data) {
    if (!map.has(l.model)) map.set(l.model, { calls: 0, tokens: 0, cost: 0 });
    const s = map.get(l.model)!;
    s.calls++;
    s.tokens += l.total_tokens;
    s.cost += Number(l.cost_usd);
  }
  const rows: CSVValue[][] = [["model_id", "provider", "calls", "total_tokens", "total_cost_usd"]];
  Array.from(map.entries())
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([m, s]) => {
      const provider = modelMeta(m).provider;
      rows.push([m, provider, s.calls, s.tokens, s.cost.toFixed(6)]);
    });
  downloadCSV(`ai-costs-by-model-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function exportByPage(
  data: UsageLog[],
  featureToPage: Record<string, string>,
) {
  const map = new Map<string, { calls: number; tokens: number; cost: number; features: Set<string>; models: Set<string> }>();
  for (const l of data) {
    const pg = featureToPage[l.feature] || "other";
    if (!map.has(pg)) map.set(pg, { calls: 0, tokens: 0, cost: 0, features: new Set(), models: new Set() });
    const s = map.get(pg)!;
    s.calls++;
    s.tokens += l.total_tokens;
    s.cost += Number(l.cost_usd);
    s.features.add(l.feature);
    s.models.add(l.model);
  }
  const rows: CSVValue[][] = [["page", "calls", "total_tokens", "total_cost_usd", "features", "models"]];
  Array.from(map.entries())
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([pg, s]) => {
      rows.push([
        pg, s.calls, s.tokens, s.cost.toFixed(6),
        Array.from(s.features).join("|"),
        Array.from(s.models).join("|"),
      ]);
    });
  downloadCSV(`ai-costs-by-page-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

export default function AiCostsPage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "90d" | "all">("30d");
  const [feature, setFeature] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTab, setViewTab] = useState<ViewTab>("overview");
  const [userModal, setUserModal] = useState<string | null>(null);
  const [modalLogPage, setModalLogPage] = useState(1);
  const [modalRange, setModalRange] = useState<typeof range>("all");
  const [pricingMenuOpen, setPricingMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [copiedProvider, setCopiedProvider] = useState<string | null>(null);
  // Per-tab pagination + search
  const [modelSearch, setModelSearch] = useState("");
  const [modelPage, setModelPage] = useState(1);
  const [pageSearch, setPageSearch] = useState("");
  const [pagePage, setPagePage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  // Filter chips inside each tab
  const [modelProviderFilter, setModelProviderFilter] = useState<"all" | ProviderKey>("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map()); // user_id → display_name
  const [userSearch, setUserSearch] = useState("");

  // Re-fetch whenever the time range changes so totals always reflect the
  // complete data for that range (the DB does the date filtering + paging).
  useEffect(() => {
    loadData(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Reset the modal's recent-calls pagination whenever the user or range changes.
  useEffect(() => { setModalLogPage(1); }, [userModal, modalRange]);
  // Default the modal range back to "All" each time a different user opens.
  useEffect(() => { setModalRange("all"); }, [userModal]);

  // Realtime INSERTs — set up once. New rows are always "now", so they fall
  // within any selected range and the client-side range filter keeps them.
  useEffect(() => {
    const ch = supabase
      .channel("admin-ai-costs-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_usage_logs" }, (p) => {
        setLogs((prev) => [p.new as UsageLog, ...prev]);
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  async function loadData(currentRange: typeof range) {
    setLoading(true);
    try {
      // Date filter happens in the DB so we only pull rows in the range.
      let cutoffISO: string | null = null;
      if (currentRange !== "all") {
        const days = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[currentRange];
        cutoffISO = new Date(Date.now() - days * 86400 * 1000).toISOString();
      }

      // Page through every matching row (Supabase caps a single request at
      // 1000) so totals are never silently truncated.
      const BATCH = 1000;
      const all: UsageLog[] = [];
      for (let from = 0; ; from += BATCH) {
        let q = supabase
          .from("ai_usage_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + BATCH - 1);
        if (cutoffISO) q = q.gte("created_at", cutoffISO);
        const { data, error } = await q;
        if (error || !data) break;
        all.push(...(data as UsageLog[]));
        if (data.length < BATCH) break;
      }

      setLogs(all);

      // Fetch display names for all unique user_ids.
      const ids = [...new Set(all.map((l) => l.user_id).filter(Boolean) as string[])];
      if (ids.length) {
        const { data: pData } = await supabase.from("profiles").select("id, display_name").in("id", ids);
        const map = new Map<string, string>();
        ((pData || []) as { id: string; display_name: string | null }[]).forEach((p) => map.set(p.id, p.display_name || p.id.slice(0, 8)));
        setProfiles(map);
      }
    } finally {
      setLoading(false);
    }
  }

  const rangeFiltered = useMemo(() => {
    if (range === "all") return logs;
    const days = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[range];
    const cutoff = Date.now() - days * 86400 * 1000;
    return logs.filter((l) => new Date(l.created_at).getTime() >= cutoff);
  }, [logs, range]);

  const filtered = useMemo(() => {
    const res = rangeFiltered.filter((l) => (!feature || l.feature === feature) && (!selectedUser || l.user_id === selectedUser));
    const sorted = [...res];
    switch (sortKey) {
      case "date_desc": sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "date_asc": sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case "cost_desc": sorted.sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd)); break;
      case "cost_asc": sorted.sort((a, b) => Number(a.cost_usd) - Number(b.cost_usd)); break;
      case "tokens_desc": sorted.sort((a, b) => b.total_tokens - a.total_tokens); break;
      case "tokens_asc": sorted.sort((a, b) => a.total_tokens - b.total_tokens); break;
    }
    return sorted;
  }, [rangeFiltered, feature, selectedUser, sortKey]);

  const totalCost = useMemo(() => filtered.reduce((s, l) => s + Number(l.cost_usd), 0), [filtered]);
  const totalTokens = useMemo(() => filtered.reduce((s, l) => s + l.total_tokens, 0), [filtered]);

  const costByFeature = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of filtered) map[l.feature] = (map[l.feature] || 0) + Number(l.cost_usd);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const dailyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of filtered) { const d = l.created_at.slice(0, 10); map[d] = (map[d] || 0) + Number(l.cost_usd); }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const userStats = useMemo(() => {
    const map: Record<string, { calls: number; tokens: number; cost: number; lastSeen: string; features: Set<string> }> = {};
    for (const l of rangeFiltered) {
      const uid = l.user_id || "__system__";
      if (!map[uid]) map[uid] = { calls: 0, tokens: 0, cost: 0, lastSeen: l.created_at, features: new Set() };
      map[uid].calls++;
      map[uid].tokens += l.total_tokens;
      map[uid].cost += Number(l.cost_usd);
      map[uid].features.add(l.feature);
      if (l.created_at > map[uid].lastSeen) map[uid].lastSeen = l.created_at;
    }
    return Object.entries(map)
      .map(([uid, s]) => ({ uid, ...s, features: Array.from(s.features) }))
      .sort((a, b) => b.cost - a.cost);
  }, [rangeFiltered]);

  const modelStats = useMemo(() => {
    const map: Record<string, { calls: number; tokens: number; cost: number; provider: string }> = {};
    for (const l of rangeFiltered) {
      const meta = modelMeta(l.model);
      if (!map[l.model]) map[l.model] = { calls: 0, tokens: 0, cost: 0, provider: meta.provider };
      map[l.model].calls++;
      map[l.model].tokens += l.total_tokens;
      map[l.model].cost += Number(l.cost_usd);
    }
    return Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
  }, [rangeFiltered]);

  const providerStats = useMemo(() => {
    const map: Record<string, { calls: number; cost: number; models: number }> = {};
    const modelsByProvider: Record<string, Set<string>> = {};
    for (const l of rangeFiltered) {
      const meta = modelMeta(l.model);
      if (!map[meta.provider]) map[meta.provider] = { calls: 0, cost: 0, models: 0 };
      map[meta.provider].calls++;
      map[meta.provider].cost += Number(l.cost_usd);
      if (!modelsByProvider[meta.provider]) modelsByProvider[meta.provider] = new Set();
      modelsByProvider[meta.provider].add(l.model);
    }
    Object.entries(modelsByProvider).forEach(([p, s]) => { if (map[p]) map[p].models = s.size; });
    return Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
  }, [rangeFiltered]);

  const pageStats = useMemo(() => {
    const map: Record<string, { calls: number; cost: number; features: Set<string>; models: Set<string> }> = {};
    for (const l of rangeFiltered) {
      const pg = pageForFeature(l.feature);
      if (!map[pg]) map[pg] = { calls: 0, cost: 0, features: new Set(), models: new Set() };
      map[pg].calls++;
      map[pg].cost += Number(l.cost_usd);
      map[pg].features.add(l.feature);
      map[pg].models.add(l.model);
    }
    return Object.entries(map)
      .map(([pg, s]) => ({ page: pg, calls: s.calls, cost: s.cost, features: Array.from(s.features), models: Array.from(s.models) }))
      .sort((a, b) => b.cost - a.cost);
  }, [rangeFiltered]);

  const featureStats = useMemo(() => {
    const map: Record<string, { calls: number; tokens: number; cost: number }> = {};
    for (const l of rangeFiltered) {
      if (!map[l.feature]) map[l.feature] = { calls: 0, tokens: 0, cost: 0 };
      map[l.feature].calls++;
      map[l.feature].tokens += l.total_tokens;
      map[l.feature].cost += Number(l.cost_usd);
    }
    return Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
  }, [rangeFiltered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function SortBtn({ label, asc, desc }: { label: string; asc: SortKey; desc: SortKey }) {
    const isAsc = sortKey === asc, isDesc = sortKey === desc;
    return (
      <button onClick={() => setSortKey(isDesc ? asc : desc)} className="flex items-center gap-1 group">
        <span className={`text-[10px] font-light ${isAsc || isDesc ? "text-violet-300" : "text-gray-500 group-hover:text-gray-300"}`}>{label}</span>
        {isDesc ? <ArrowDown className="w-2.5 h-2.5 text-violet-400" /> : isAsc ? <ArrowUp className="w-2.5 h-2.5 text-violet-400" /> : <ArrowsDownUp className="w-2.5 h-2.5 text-gray-600 group-hover:text-gray-400" />}
      </button>
    );
  }

  const totalBarCost = costByFeature.reduce((s, [, v]) => s + v, 0);
  // Show only the top features in the bar chart so the long tail of tiny
  // bars doesn't crowd the x-axis (full list lives in the table below).
  const barFeatures = costByFeature.slice(0, 12);
  const tooltipBox = {
    backgroundColor: "rgba(12,12,12,0.95)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    padding: [8, 12] as [number, number],
    textStyle: { color: "#e5e7eb", fontSize: 11 },
  };

  const barOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...tooltipBox,
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
      formatter: (params: ChartTooltipParam[]) => {
        const d = params[0];
        const val = Number(d.value);
        const pct = totalBarCost > 0 ? (val / totalBarCost) * 100 : 0;
        return `${d.marker ?? ""}<span style="color:#fff;font-weight:600">${d.name}</span><br/>`
          + `<span style="color:#a78bfa;font-weight:600">${fmtCostFull(val)}</span> `
          + `<span style="color:#6b7280">· ${pct.toFixed(1)}% of total</span>`;
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 88, containLabel: true },
    xAxis: {
      type: "category",
      data: barFeatures.map(([f]) => FEATURE_LABELS[f] || f),
      axisLabel: { color: "#9ca3af", fontSize: 10, rotate: 35, hideOverlap: false },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      axisLabel: { color: "#6b7280", fontSize: 10, formatter: fmtAxisCost },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)", type: "dashed" } },
    },
    series: [{
      type: "bar",
      barMaxWidth: 30,
      data: barFeatures.map(([f, v]) => {
        const c = FEATURE_COLORS[f] || "#8b5cf6";
        return {
          value: v,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [
              { offset: 0, color: hexToRgba(c, 0.95) },
              { offset: 1, color: hexToRgba(c, 0.32) },
            ] },
          },
        };
      }),
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.45)" } },
      animationDuration: 600,
    }],
  };

  const lineColor = "#a78bfa";
  const lineOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...tooltipBox,
      axisPointer: { type: "line", lineStyle: { color: "rgba(167,139,250,0.45)", type: "dashed", width: 1 } },
      formatter: (params: ChartTooltipParam[]) => {
        const d = params[0];
        return `<span style="color:#9ca3af">${d.name}</span><br/>`
          + `${d.marker ?? ""}<span style="color:#a78bfa;font-weight:600">${fmtCostFull(Number(d.value))}</span>`;
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 28, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dailyTrend.map(([d]) => d),
      axisLabel: { color: "#6b7280", fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      axisLabel: { color: "#6b7280", fontSize: 10, formatter: fmtAxisCost },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)", type: "dashed" } },
    },
    series: [{
      type: "line",
      data: dailyTrend.map(([, v]) => v),
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      showSymbol: false,
      itemStyle: { color: lineColor, borderColor: "#0c0c0c", borderWidth: 2 },
      lineStyle: { color: lineColor, width: 2.5, shadowColor: hexToRgba(lineColor, 0.5), shadowBlur: 12, shadowOffsetY: 4 },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [
        { offset: 0, color: hexToRgba(lineColor, 0.3) },
        { offset: 1, color: hexToRgba(lineColor, 0) },
      ] } },
    }],
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-white tracking-tight flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-400" weight="duotone" />
            AI Spend Observatory
          </h1>
          <p className="text-xs text-gray-500 mt-1">Real-time cost intelligence across Gemini, Fal.ai & Replicate · per model, user, feature & page</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time range */}
          <div className="flex items-center gap-1 mr-2">
            {(["24h", "7d", "30d", "90d", "all"] as const).map((r) => (
              <button key={r} onClick={() => { setRange(r); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-light transition-all ${range === r ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent hover:border-white/10"}`}>
                {r === "all" ? "All" : r}
              </button>
            ))}
          </div>
          {/* Pricing reference dropdown */}
          <div className="relative">
            <button
              onClick={() => setPricingMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-all cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5" />
              Pricing
            </button>
            {pricingMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setPricingMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-[420px] max-h-[70vh] overflow-y-auto bg-[#0c0c0c] border border-white/10 rounded-xl shadow-2xl z-40" data-lenis-prevent>
                  {(["gemini", "elevenlabs", "fal", "replicate"] as const).map((prov) => {
                    const lbl = PROVIDER_LABELS[prov];
                    const items = Object.entries(MODEL_PRICE_INFO).filter(([m]) => modelMeta(m).provider === prov);
                    if (items.length === 0) return null;
                    const dashUrl = PROVIDER_DASHBOARDS[prov];
                    return (
                      <div key={prov} className="px-3 pt-3 pb-1">
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: lbl.color }}>{lbl.name}</p>
                          {dashUrl && (
                            <div className="flex items-center gap-1">
                              <a
                                href={dashUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={`Open ${lbl.name} billing dashboard`}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
                              >
                                <ArrowSquareOut className="w-3 h-3" /> Dashboard
                              </a>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(dashUrl);
                                  setCopiedProvider(prov);
                                  setTimeout(() => setCopiedProvider((c) => (c === prov ? null : c)), 1500);
                                }}
                                title="Copy dashboard link"
                                className="flex items-center justify-center w-5 h-5 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
                              >
                                {copiedProvider === prov ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {items.map(([m, info]) => {
                            const meta = modelMeta(m);
                            return (
                              <div key={m} className="flex items-start justify-between gap-3 px-2 py-1.5 rounded hover:bg-white/[0.03]">
                                <div className="min-w-0">
                                  <p className="text-[12px] text-gray-200 truncate">{meta.name}</p>
                                  <p className="text-[9px] text-gray-600 font-mono truncate">{m}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[12px] font-semibold" style={{ color: lbl.color }}>{info.price}</p>
                                  <p className="text-[9px] text-gray-600">{info.unit}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-4 py-2 border-t border-white/[0.06] text-[9px] text-gray-700">
                    Prices reflect official rates at time of integration. Actual costs may vary slightly.
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => loadData(range)} className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer">
            <ArrowsClockwise className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#0c0c0c] border border-white/10 rounded-xl shadow-2xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Export as CSV</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">Uses current time range & filters</p>
                  </div>
                  {[
                    { key: "raw", label: "Raw Logs", desc: `All ${fmt(filtered.length)} log entries`, run: () => exportRawLogs(filtered, profiles) },
                    { key: "user", label: "Per User Summary", desc: "Aggregated by user", run: () => exportPerUser(filtered, profiles) },
                    { key: "model", label: "By Model Summary", desc: "Aggregated by model", run: () => exportByModel(filtered) },
                    { key: "page", label: "By Page Summary", desc: "Aggregated by app page", run: () => exportByPage(filtered, FEATURE_TO_PAGE) },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { opt.run(); setExportMenuOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium">{opt.label}</p>
                        <p className="text-[10px] text-gray-600">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-0">
        {([["overview", "Overview"], ["per_user", "Per User"], ["by_model", "By Model"], ["by_page", "By Page"]] as [ViewTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setViewTab(key)}
            className={`px-4 py-2 text-sm font-light transition-all border-b-2 -mb-px ${viewTab === key ? "text-violet-300 border-violet-500" : "text-gray-500 border-transparent hover:text-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32 text-gray-600 text-sm">Loading...</div>
      ) : (
        <>
          {/* Active filters */}
          <div className="flex flex-wrap gap-2 mb-4">
          {feature && (
            <button onClick={() => { setFeature(null); setCurrentPage(1); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-xs text-violet-300 hover:bg-violet-500/25 transition-all cursor-pointer">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: FEATURE_COLORS[feature] || "#8b5cf6" }} />
              {FEATURE_LABELS[feature] || feature}
              <X className="w-3 h-3" />
            </button>
          )}
          {selectedUser && (
            <button onClick={() => { setSelectedUser(null); setCurrentPage(1); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/25 text-xs text-sky-300 hover:bg-sky-500/25 transition-all cursor-pointer">
              👤 {profiles.get(selectedUser) || selectedUser.slice(0, 8)}
              <X className="w-3 h-3" />
            </button>
          )}
          </div>

          {/* Summary cards — Overview only */}
          {viewTab === "overview" && <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2"><Coins className="w-3.5 h-3.5 text-violet-400" weight="duotone" /><span className="text-[10px] text-gray-500">Total Cost</span></div>
              <div className="text-xl font-light text-white">{fmtCost(totalCost)}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{fmtCostFull(totalCost)}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2"><Sparkle className="w-3.5 h-3.5 text-sky-400" weight="duotone" /><span className="text-[10px] text-gray-500">Total Calls</span></div>
              <div className="text-xl font-light text-white">{fmt(filtered.length)}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">avg {filtered.length > 0 ? fmtCostFull(totalCost / filtered.length) : "$0"} / call</div>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2"><Lightning className="w-3.5 h-3.5 text-amber-400" weight="duotone" /><span className="text-[10px] text-gray-500">Total Tokens</span></div>
              <div className="text-xl font-light text-white">{fmt(totalTokens)}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">in + out combined</div>
            </div>
          </div>}

          {/* ── PER USER VIEW ─────────────────────────────────────────── */}
          {viewTab === "per_user" && (() => {
            const q = userSearch.trim().toLowerCase();
            const filteredUsers = userStats.filter((u) => !q || (profiles.get(u.uid) || u.uid).toLowerCase().includes(q));
            const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
            const pagedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);
            return (
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4 gap-3">
                <span className="text-xs text-gray-400 font-light">User Breakdown <span className="text-gray-600">({filteredUsers.length} of {userStats.length})</span></span>
                <input
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                  placeholder="Search user…"
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/30 w-48"
                />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 pr-4 text-gray-500 font-light">User</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Calls</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Tokens</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Cost</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-light">Features</th>
                    <th className="text-right py-2 text-gray-500 font-light">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers
                    .map((u) => {
                      const isSystem = u.uid === "__system__";
                      const name = isSystem ? "System / Background" : (profiles.get(u.uid) || u.uid.slice(0, 8) + "…");
                      return (
                        <tr
                          key={u.uid}
                          onClick={() => setUserModal(u.uid)}
                          className={`border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.02] ${isSystem ? "opacity-80" : ""}`}
                        >
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isSystem ? "bg-gray-500/20 border border-gray-500/20 text-gray-400" : "bg-violet-500/20 border border-violet-500/20 text-violet-300"}`}>
                                {isSystem ? "⚙" : name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className={`font-light ${isSystem ? "text-gray-400 italic" : "text-gray-200"}`}>{name}</p>
                                {!isSystem && (
                                  <p className="text-[9px] text-gray-600 font-mono">{u.uid.slice(0, 16)}…</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-right py-2.5 pr-4 text-gray-400">{fmt(u.calls)}</td>
                          <td className="text-right py-2.5 pr-4 text-gray-400">{fmt(u.tokens)}</td>
                          <td className="text-right py-2.5 pr-4 text-violet-300 font-light">{fmtCostFull(u.cost)}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex flex-wrap gap-1">
                              {u.features.slice(0, 4).map((f) => (
                                <span key={f} className="px-1.5 py-0.5 rounded text-[9px] font-light" style={{ background: (FEATURE_COLORS[f] || "#6b7280") + "22", color: FEATURE_COLORS[f] || "#9ca3af" }}>
                                  {FEATURE_LABELS[f] || f}
                                </span>
                              ))}
                              {u.features.length > 4 && <span className="text-[9px] text-gray-600">+{u.features.length - 4}</span>}
                            </div>
                          </td>
                          <td className="text-right py-2.5 text-gray-600">{timeAgo(u.lastSeen)}</td>
                        </tr>
                      );
                    })}
                  {filteredUsers.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-600">No users match</td></tr>}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <span className="text-xs text-gray-600">Page {userPage} of {totalUserPages} · {fmt(filteredUsers.length)} total</span>
                <div className="flex gap-2">
                  <button onClick={() => setUserPage(1)} disabled={userPage === 1} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30">First</button>
                  <button onClick={() => setUserPage((p) => Math.max(1, p - 1))} disabled={userPage === 1} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30">
                    <CaretLeft className="w-3 h-3" />
                  </button>
                  <button onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))} disabled={userPage === totalUserPages} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30">
                    <CaretRight className="w-3 h-3" />
                  </button>
                  <button onClick={() => setUserPage(totalUserPages)} disabled={userPage === totalUserPages} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30">Last</button>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ── BY MODEL VIEW ─────────────────────────────────────────── */}
          {viewTab === "by_model" && (() => {
            // Filter + paginate models
            const q = modelSearch.trim().toLowerCase();
            const filteredModels = modelStats.filter(([m]) => {
              const meta = modelMeta(m);
              if (modelProviderFilter !== "all" && meta.provider !== modelProviderFilter) return false;
              if (!q) return true;
              return meta.name.toLowerCase().includes(q) || m.toLowerCase().includes(q);
            });
            const totalModelPages = Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE));
            const paged = filteredModels.slice((modelPage - 1) * PAGE_SIZE, modelPage * PAGE_SIZE);
            return (
              <div className="space-y-6 mb-6">
                {/* Provider summary cards (clickable as filters) */}
                <div className="grid grid-cols-4 gap-3">
                  <button onClick={() => { setModelProviderFilter("all"); setModelPage(1); }}
                    className={`border rounded-2xl p-4 text-left transition-all ${modelProviderFilter === "all" ? "bg-white/[0.06] border-white/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">All</span>
                      <span className="text-[10px] text-gray-500">{modelStats.length} models</span>
                    </div>
                    <div className="text-xl font-light text-white">{fmtCost(modelStats.reduce((s, [, m]) => s + m.cost, 0))}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{fmt(modelStats.reduce((s, [, m]) => s + m.calls, 0))} calls</div>
                  </button>
                  {(["gemini", "elevenlabs", "fal", "replicate"] as const).map((p) => {
                    const stat = providerStats.find(([key]) => key === p);
                    const meta = PROVIDER_LABELS[p];
                    const active = modelProviderFilter === p;
                    return (
                      <button key={p}
                        onClick={() => { setModelProviderFilter(p); setModelPage(1); }}
                        className={`${meta.bg} border rounded-2xl p-4 text-left transition-all ${active ? "border-white/40 ring-1 ring-white/20" : "border-white/10 hover:border-white/20"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>{meta.name}</span>
                          <span className="text-[10px] text-gray-500">{stat ? stat[1].models : 0} models</span>
                        </div>
                        <div className="text-xl font-light text-white">{fmtCost(stat ? stat[1].cost : 0)}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{stat ? fmt(stat[1].calls) : 0} calls</div>
                      </button>
                    );
                  })}
                </div>

                {/* Per-model breakdown */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <span className="text-xs text-gray-400 font-light">Model Breakdown <span className="text-gray-600">({filteredModels.length} of {modelStats.length})</span></span>
                    <input
                      value={modelSearch}
                      onChange={(e) => { setModelSearch(e.target.value); setModelPage(1); }}
                      placeholder="Search model…"
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/30 w-48"
                    />
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left py-2 pr-4 text-gray-500 font-light">Model</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-light">Provider</th>
                        <th className="text-right py-2 pr-4 text-gray-500 font-light">Calls</th>
                        <th className="text-right py-2 pr-4 text-gray-500 font-light">Tokens</th>
                        <th className="text-right py-2 text-gray-500 font-light">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(([m, s]) => {
                        const meta = modelMeta(m);
                        const provLabel = PROVIDER_LABELS[meta.provider];
                        return (
                          <tr key={m} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                                <div className="min-w-0">
                                  <p className="text-gray-200 font-light truncate">{meta.name}</p>
                                  <p className="text-[9px] text-gray-700 font-mono truncate">{m}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 pr-4">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-widest ${provLabel.bg}`} style={{ color: provLabel.color }}>
                                {provLabel.name}
                              </span>
                            </td>
                            <td className="text-right py-2 pr-4 text-gray-400">{fmt(s.calls)}</td>
                            <td className="text-right py-2 pr-4 text-gray-400">{s.tokens > 0 ? fmt(s.tokens) : <span className="text-gray-700">—</span>}</td>
                            <td className="text-right py-2 text-violet-300 font-light">{fmtCostFull(s.cost)}</td>
                          </tr>
                        );
                      })}
                      {filteredModels.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-600">No models match this filter</td></tr>}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                    <span className="text-xs text-gray-600">Page {modelPage} of {totalModelPages} · {fmt(filteredModels.length)} total</span>
                    <div className="flex gap-2">
                      <button onClick={() => setModelPage(1)} disabled={modelPage === 1} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30">First</button>
                      <button onClick={() => setModelPage((p) => Math.max(1, p - 1))} disabled={modelPage === 1} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30">
                        <CaretLeft className="w-3 h-3" />
                      </button>
                      <button onClick={() => setModelPage((p) => Math.min(totalModelPages, p + 1))} disabled={modelPage === totalModelPages} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30">
                        <CaretRight className="w-3 h-3" />
                      </button>
                      <button onClick={() => setModelPage(totalModelPages)} disabled={modelPage === totalModelPages} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30">Last</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── BY PAGE VIEW ──────────────────────────────────────────── */}
          {viewTab === "by_page" && (() => {
            const q = pageSearch.trim().toLowerCase();
            const filteredPages = pageStats.filter((p) => {
              if (pageFilter !== "all" && p.page !== pageFilter) return false;
              if (!q) return true;
              const lbl = PAGE_LABELS[p.page]?.name || p.page;
              return lbl.toLowerCase().includes(q);
            });
            const totalPagePages = Math.max(1, Math.ceil(filteredPages.length / PAGE_SIZE));
            const pagedPages = filteredPages.slice((pagePage - 1) * PAGE_SIZE, pagePage * PAGE_SIZE);
            return (
              <div className="space-y-6 mb-6">
                {/* Page summary cards */}
                <div className="grid grid-cols-4 gap-3">
                  {pageStats.map((p) => {
                    const lbl = PAGE_LABELS[p.page] || PAGE_LABELS.other;
                    const active = pageFilter === p.page;
                    return (
                      <button key={p.page}
                        onClick={() => setPageFilter(active ? "all" : p.page)}
                        className={`${lbl.bg} border rounded-2xl p-4 text-left transition-all ${active ? "border-white/40 ring-1 ring-white/20" : "border-white/10 hover:border-white/20"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: lbl.color }}>
                            <span>{lbl.icon}</span> {lbl.name}
                          </span>
                          <span className="text-[10px] text-gray-500">{p.models.length} models</span>
                        </div>
                        <div className="text-xl font-light text-white">{fmtCost(p.cost)}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{fmt(p.calls)} calls · {p.features.length} features</div>
                      </button>
                    );
                  })}
                  {pageStats.length === 0 && (
                    <div className="col-span-4 bg-white/[0.02] border border-white/10 rounded-2xl p-8 text-center text-gray-600 text-sm">
                      No usage data yet
                    </div>
                  )}
                </div>

                {/* Per-page detail breakdown */}
                <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <span className="text-xs text-gray-400 font-light">
                      Page Detail
                      {pageFilter !== "all" && (
                        <button onClick={() => setPageFilter("all")} className="ml-2 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-[10px] text-violet-300">
                          {PAGE_LABELS[pageFilter]?.name || pageFilter} <X className="inline w-2.5 h-2.5 ml-0.5" />
                        </button>
                      )}
                    </span>
                    <input
                      value={pageSearch}
                      onChange={(e) => { setPageSearch(e.target.value); setPagePage(1); }}
                      placeholder="Search page…"
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/30 w-48"
                    />
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left py-2 pr-4 text-gray-500 font-light">Page</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-light">Features Used</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-light">Models Used</th>
                        <th className="text-right py-2 pr-4 text-gray-500 font-light">Calls</th>
                        <th className="text-right py-2 text-gray-500 font-light">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPages.map((p) => {
                        const lbl = PAGE_LABELS[p.page] || PAGE_LABELS.other;
                        return (
                          <tr key={p.page} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <span>{lbl.icon}</span>
                                <span className="text-gray-200 font-light">{lbl.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-4">
                              <div className="flex flex-wrap gap-1">
                                {p.features.slice(0, 4).map((f) => (
                                  <span key={f} className="px-1.5 py-0.5 rounded text-[9px] font-light" style={{ background: (FEATURE_COLORS[f] || "#6b7280") + "22", color: FEATURE_COLORS[f] || "#9ca3af" }}>
                                    {FEATURE_LABELS[f] || f}
                                  </span>
                                ))}
                                {p.features.length > 4 && <span className="text-[9px] text-gray-600">+{p.features.length - 4}</span>}
                              </div>
                            </td>
                            <td className="py-2.5 pr-4">
                              <div className="flex flex-wrap gap-1">
                                {p.models.slice(0, 3).map((m) => {
                                  const mMeta = modelMeta(m);
                                  return (
                                    <span key={m} className="px-1.5 py-0.5 rounded text-[9px] font-light" style={{ background: mMeta.color + "22", color: mMeta.color }}>
                                      {mMeta.name}
                                    </span>
                                  );
                                })}
                                {p.models.length > 3 && <span className="text-[9px] text-gray-600">+{p.models.length - 3}</span>}
                              </div>
                            </td>
                            <td className="text-right py-2.5 pr-4 text-gray-400">{fmt(p.calls)}</td>
                            <td className="text-right py-2.5 text-violet-300 font-light">{fmtCostFull(p.cost)}</td>
                          </tr>
                        );
                      })}
                      {filteredPages.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-600">No pages match this filter</td></tr>}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                    <span className="text-xs text-gray-600">Page {pagePage} of {totalPagePages} · {fmt(filteredPages.length)} total</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPagePage(1)} disabled={pagePage === 1} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30">First</button>
                      <button onClick={() => setPagePage((p) => Math.max(1, p - 1))} disabled={pagePage === 1} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30">
                        <CaretLeft className="w-3 h-3" />
                      </button>
                      <button onClick={() => setPagePage((p) => Math.min(totalPagePages, p + 1))} disabled={pagePage === totalPagePages} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30">
                        <CaretRight className="w-3 h-3" />
                      </button>
                      <button onClick={() => setPagePage(totalPagePages)} disabled={pagePage === totalPagePages} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30">Last</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── OVERVIEW VIEW ─────────────────────────────────────────── */}
          {viewTab === "overview" && (<>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4"><ChartBar className="w-4 h-4 text-violet-400" weight="duotone" /><span className="text-xs text-gray-400 font-light">Cost by Feature</span></div>
              {costByFeature.length === 0 ? <div className="flex items-center justify-center h-48 text-xs text-gray-600">No data yet</div> : <ReactEChartsCore echarts={echarts} option={barOption} style={{ height: 320 }} />}
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4"><ChartBar className="w-4 h-4 text-violet-400" weight="duotone" /><span className="text-xs text-gray-400 font-light">Daily Cost Trend</span></div>
              {dailyTrend.length === 0 ? <div className="flex items-center justify-center h-48 text-xs text-gray-600">No data yet</div> : <ReactEChartsCore echarts={echarts} option={lineOption} style={{ height: 320 }} />}
            </div>
          </div>

          {/* Feature breakdown */}
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 mb-6">
            <div className="text-xs text-gray-400 font-light mb-4">Feature Breakdown <span className="text-gray-600">(click to filter)</span></div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 pr-4 text-gray-500 font-light">Feature</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-light">Calls</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-light">Tokens</th>
                  <th className="text-right py-2 text-gray-500 font-light">Cost</th>
                </tr>
              </thead>
              <tbody>
                {featureStats.map(([f, s]) => (
                  <tr key={f} className={`border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer ${feature === f ? "bg-violet-500/5" : ""}`} onClick={() => { setFeature(feature === f ? null : f); setCurrentPage(1); }}>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: FEATURE_COLORS[f] || "#6b7280" }} />
                        <span className="text-gray-300">{FEATURE_LABELS[f] || f}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 pr-4 text-gray-400">{fmt(s.calls)}</td>
                    <td className="text-right py-2 pr-4 text-gray-400">{fmt(s.tokens)}</td>
                    <td className="text-right py-2 text-violet-300 font-light">{fmtCostFull(s.cost)}</td>
                  </tr>
                ))}
                {featureStats.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-600">No data yet</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Raw log */}
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-400 font-light">Raw Log <span className="text-gray-600">({fmt(filtered.length)} entries)</span></span>
              <div className="flex items-center gap-4">
                <SortBtn label="Date" asc="date_asc" desc="date_desc" />
                <SortBtn label="Cost" asc="cost_asc" desc="cost_desc" />
                <SortBtn label="Tokens" asc="tokens_asc" desc="tokens_desc" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 pr-4 text-gray-500 font-light">User</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-light">Feature</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-light">Model</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Input</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Output</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Total</th>
                    <th className="text-right py-2 pr-4 text-gray-500 font-light">Cost</th>
                    <th className="text-right py-2 text-gray-500 font-light">When</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-gray-600">No data</td></tr>
                  ) : paginated.map((l) => (
                    <tr key={l.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer ${selectedUser === l.user_id ? "bg-sky-500/[0.04]" : ""}`}
                      onClick={() => l.user_id && setSelectedUser(selectedUser === l.user_id ? null : l.user_id)}>
                      <td className="py-2 pr-4">
                        <span className="text-sky-300 text-[10px] font-light">
                          {l.user_id ? (profiles.get(l.user_id) || l.user_id.slice(0, 8) + "…") : "system"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: FEATURE_COLORS[l.feature] || "#6b7280" }} />
                          <span className="text-gray-300">{FEATURE_LABELS[l.feature] || l.feature}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        {(() => {
                          const meta = modelMeta(l.model);
                          const prov = PROVIDER_LABELS[meta.provider];
                          return (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-widest ${prov.bg}`} style={{ color: prov.color }}>
                              {prov.name}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-right py-2 pr-4 text-gray-500">{fmt(l.input_tokens)}</td>
                      <td className="text-right py-2 pr-4 text-gray-500">{fmt(l.output_tokens)}</td>
                      <td className="text-right py-2 pr-4 text-gray-400">{fmt(l.total_tokens)}</td>
                      <td className="text-right py-2 pr-4 text-violet-300">{fmtCostFull(Number(l.cost_usd))}</td>
                      <td className="text-right py-2 text-gray-600">{timeAgo(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <span className="text-xs text-gray-600">Page {currentPage} of {totalPages} · {fmt(filtered.length)} total</span>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">First</button>
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                  <CaretLeft className="w-3 h-3" />
                </button>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                  <CaretRight className="w-3 h-3" />
                </button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">Last</button>
              </div>
            </div>
          </div>
          </>)}
        </>
      )}

      {/* ── User Detail Modal ─────────────────────────────────────────── */}
      {userModal && (() => {
        const uid = userModal;
        const isSystem = uid === "__system__";
        const name = isSystem ? "System / Background" : (profiles.get(uid) || uid.slice(0, 8) + "…");
        const modalCutoff = modalRange === "all" ? 0 : Date.now() - ({ "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[modalRange]) * 86400 * 1000;
        const userLogs = logs.filter((l) => (isSystem ? !l.user_id : l.user_id === uid) && new Date(l.created_at).getTime() >= modalCutoff);
        const totalCostU = userLogs.reduce((s, l) => s + Number(l.cost_usd), 0);
        const totalTokensU = userLogs.reduce((s, l) => s + l.total_tokens, 0);
        const avgCostU = userLogs.length ? totalCostU / userLogs.length : 0;
        const byFeature: Record<string, { calls: number; cost: number; tokens: number }> = {};
        const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};
        let firstSeen = userLogs[0]?.created_at ?? "";
        let lastSeen = userLogs[0]?.created_at ?? "";
        for (const l of userLogs) {
          if (!byFeature[l.feature]) byFeature[l.feature] = { calls: 0, cost: 0, tokens: 0 };
          byFeature[l.feature].calls++;
          byFeature[l.feature].cost += Number(l.cost_usd);
          byFeature[l.feature].tokens += l.total_tokens;
          if (!byModel[l.model]) byModel[l.model] = { calls: 0, cost: 0, tokens: 0 };
          byModel[l.model].calls++;
          byModel[l.model].cost += Number(l.cost_usd);
          byModel[l.model].tokens += l.total_tokens;
          if (l.created_at < firstSeen) firstSeen = l.created_at;
          if (l.created_at > lastSeen) lastSeen = l.created_at;
        }
        const featList = Object.entries(byFeature).sort((a, b) => b[1].cost - a[1].cost);
        const modelList = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
        const MODAL_LOG_SIZE = 10;
        const totalModalLogPages = Math.max(1, Math.ceil(userLogs.length / MODAL_LOG_SIZE));
        const safeModalPage = Math.min(modalLogPage, totalModalLogPages);
        const pagedUserLogs = userLogs.slice((safeModalPage - 1) * MODAL_LOG_SIZE, safeModalPage * MODAL_LOG_SIZE);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setUserModal(null)}>
            <div className="bg-[#0d0d0d] border border-white/[0.1] rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold ${isSystem ? "bg-gray-500/20 border-gray-500/20 text-gray-300" : "bg-violet-500/20 border-violet-500/20 text-violet-300"}`}>
                    {isSystem ? "⚙" : name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{name}</p>
                    <p className="text-[10px] text-gray-600 font-mono">{isSystem ? "Background & scheduled jobs · no user account" : uid}</p>
                  </div>
                </div>
                <button onClick={() => setUserModal(null)} className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Range filter (independent of the page range) */}
              <div className="flex items-center gap-1 px-5 py-2.5 border-b border-white/[0.06] shrink-0">
                <span className="text-[10px] text-gray-600 mr-1">Range</span>
                {(["24h", "7d", "30d", "90d", "all"] as const).map((r) => (
                  <button key={r} onClick={() => setModalRange(r)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-light transition-all cursor-pointer ${modalRange === r ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent hover:border-white/10"}`}>
                    {r === "all" ? "All" : r}
                  </button>
                ))}
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
                <div className="bg-white/[0.03] rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">Total Cost</p>
                  <p className="text-white font-light">{fmtCostFull(totalCostU)}</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">Total Calls</p>
                  <p className="text-white font-light">{fmt(userLogs.length)}</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">Total Tokens</p>
                  <p className="text-white font-light">{fmt(totalTokensU)}</p>
                </div>
              </div>

              {/* Extra stats */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 border-b border-white/[0.06] shrink-0 text-[10px] text-gray-500">
                <span>Avg <span className="text-gray-300">{fmtCostFull(avgCostU)}</span> / call</span>
                <span><span className="text-gray-300">{modelList.length}</span> models · <span className="text-gray-300">{featList.length}</span> features</span>
                <span>First <span className="text-gray-300">{firstSeen ? timeAgo(firstSeen) : "—"}</span></span>
                <span>Last <span className="text-gray-300">{lastSeen ? timeAgo(lastSeen) : "—"}</span></span>
              </div>

              {/* Feature breakdown + raw logs */}
              <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-4" data-lenis-prevent>
                {/* Features */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Features used</p>
                  <div className="space-y-1.5">
                    {featList.map(([f, s]) => (
                      <div key={f} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: FEATURE_COLORS[f] || "#6b7280" }} />
                          <span className="text-gray-300">{FEATURE_LABELS[f] || f}</span>
                        </div>
                        <div className="flex items-center gap-4 text-gray-500">
                          <span>{fmt(s.calls)} calls</span>
                          <span>{fmt(s.tokens)} tokens</span>
                          <span className="text-violet-300">{fmtCostFull(s.cost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Models */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Models used</p>
                  <div className="space-y-1.5">
                    {modelList.map(([m, s]) => {
                      const meta = modelMeta(m);
                      return (
                        <div key={m} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                            <span className="text-gray-300 truncate">{meta.name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-gray-500 shrink-0">
                            <span>{fmt(s.calls)} calls</span>
                            <span>{fmt(s.tokens)} tokens</span>
                            <span className="text-violet-300">{fmtCostFull(s.cost)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent logs */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Recent calls <span className="text-gray-600 normal-case tracking-normal">({fmt(userLogs.length)})</span></p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left py-1.5 pr-3 text-gray-600 font-light">Feature</th>
                        <th className="text-left py-1.5 pr-3 text-gray-600 font-light">Model</th>
                        <th className="text-right py-1.5 pr-3 text-gray-600 font-light">Tokens</th>
                        <th className="text-right py-1.5 pr-3 text-gray-600 font-light">Cost</th>
                        <th className="text-right py-1.5 text-gray-600 font-light">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedUserLogs.map((l) => (
                        <tr key={l.id} className="border-b border-white/[0.03]">
                          <td className="py-1.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: FEATURE_COLORS[l.feature] || "#6b7280" }} />
                              <span className="text-gray-400">{FEATURE_LABELS[l.feature] || l.feature}</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-3">
                            {(() => {
                              const meta = modelMeta(l.model);
                              const prov = PROVIDER_LABELS[meta.provider];
                              return (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-widest ${prov.bg}`} style={{ color: prov.color }} title={meta.name}>
                                  {prov.name}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="text-right py-1.5 pr-3 text-gray-500">{fmt(l.total_tokens)}</td>
                          <td className="text-right py-1.5 pr-3 text-violet-300">{fmtCostFull(Number(l.cost_usd))}</td>
                          <td className="text-right py-1.5 text-gray-600">{timeAgo(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalModalLogPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <span className="text-[10px] text-gray-600">Page {safeModalPage} of {totalModalLogPages}</span>
                      <div className="flex gap-2">
                        <button onClick={() => setModalLogPage(1)} disabled={safeModalPage === 1} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">First</button>
                        <button onClick={() => setModalLogPage((p) => Math.max(1, p - 1))} disabled={safeModalPage === 1} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                          <CaretLeft className="w-3 h-3" />
                        </button>
                        <button onClick={() => setModalLogPage((p) => Math.min(totalModalLogPages, p + 1))} disabled={safeModalPage === totalModalLogPages} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                          <CaretRight className="w-3 h-3" />
                        </button>
                        <button onClick={() => setModalLogPage(totalModalLogPages)} disabled={safeModalPage === totalModalLogPages} className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">Last</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
