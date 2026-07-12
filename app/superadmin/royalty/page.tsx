"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Percent,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  DollarSign,
} from "lucide-react";

export default function RoyaltyPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentRoyalty, setCurrentRoyalty] = useState(3);
  const [inputRoyalty, setInputRoyalty] = useState("3");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const session = await supabase.auth.getSession();
      const t = session.data.session?.access_token || "";
      setToken(t);
      if (t) await load(t);
    }
    init();
  }, []);

  async function load(t: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/royalty", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      setCurrentRoyalty(data.royalty_percent ?? 3);
      setInputRoyalty(String(data.royalty_percent ?? 3));
      setUpdatedAt(data.updated_at || null);
      setIsDefault(!!data.is_default);
      setDbError(data.db_error || null);
    } catch (e: any) {
      setErrorMsg(e.message);
    }
    setLoading(false);
  }

  async function handleSave() {
    const num = Number(inputRoyalty);
    if (isNaN(num) || num < 0 || num > 100) {
      setErrorMsg("Enter a value between 0 and 100");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/royalty", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ royalty_percent: num }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRoyalty(num);
        setUpdatedAt(new Date().toISOString());
        setIsDefault(false);
        setDbError(null);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
      } else {
        setErrorMsg(data.error || "Failed to save");
        if (data.details) setDbError(data.details);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 text-white">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-light flex items-center gap-2">
          <Percent className="w-5 h-5 text-red-500" />
          Creator Royalty
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          The royalty paid to the <span className="text-gray-300">original creator</span> when a
          remix or resale of their Commercial-licensed asset is sold downstream. Applies
          platform-wide.
        </p>
      </div>

      {/* DB error banner */}
      {dbError && (
        <div className="p-4 border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs space-y-2">
            <p className="text-yellow-300">
              Setting persistence is unavailable. The platform is using the default{" "}
              {currentRoyalty}% royalty.
            </p>
            <p className="text-gray-500 font-mono leading-relaxed bg-black/40 p-2 border border-white/5">
              {dbError}
            </p>
            <p className="text-gray-500">Run this SQL in Supabase to enable persistence:</p>
            <pre className="text-[10px] text-emerald-300 font-mono bg-black/60 p-3 border border-white/5 overflow-x-auto leading-snug">
{`CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value_number numeric,
  value_text text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO platform_settings (key, value_number)
VALUES ('royalty_percent', 3)
ON CONFLICT (key) DO NOTHING;`}
            </pre>
          </div>
        </div>
      )}

      {/* Current royalty card */}
      <div className="border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-5xl font-light text-white tabular-nums">
            {currentRoyalty}
          </span>
          <span className="text-xl text-gray-500">%</span>
          {isDefault && (
            <span className="text-[10px] px-2 py-0.5 border border-yellow-500/30 text-yellow-400 uppercase tracking-wider">
              default
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Current royalty to the original creator on downstream sales
        </p>
        {updatedAt && (
          <p className="text-[10px] text-gray-600 mt-2">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Edit royalty */}
      <div className="border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
            Adjust Royalty Percentage
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={inputRoyalty}
                onChange={(e) => setInputRoyalty(e.target.value)}
                className="w-full bg-black border border-white/15 px-4 py-3 pr-10 text-2xl font-light tabular-nums focus:outline-none focus:border-red-500/50"
              />
              <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || Number(inputRoyalty) === currentRoyalty}
              className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm transition-colors"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : savedFlash ? (
                <><CheckCircle2 className="w-4 h-4" /> Saved</>
              ) : (
                <><Save className="w-4 h-4" /> Save</>
              )}
            </button>
          </div>
          {errorMsg && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {errorMsg}
            </p>
          )}
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">
            Presets:
          </span>
          {[1, 3, 5, 7.5, 10, 15].map((p) => (
            <button
              key={p}
              onClick={() => setInputRoyalty(String(p))}
              className={`text-xs px-2.5 py-1 border transition-colors ${
                Number(inputRoyalty) === p
                  ? "border-red-500/50 bg-red-500/10 text-red-300"
                  : "border-white/10 text-gray-400 hover:border-white/25 hover:text-white"
              }`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      <div className="border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            Live Preview · {Number(inputRoyalty) || 0}% royalty on a downstream sale
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                <th className="text-left pb-3 font-light">Remix / Resale Price</th>
                <th className="text-right pb-3 font-light">Original Creator Earns</th>
                <th className="text-right pb-3 font-light">Seller Keeps (pre-platform-fee)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[10, 50, 150, 500].map((dollarTotal) => {
                const cents = dollarTotal * 100;
                const royalty = Math.floor(
                  (cents * (Number(inputRoyalty) || 0)) / 100,
                );
                return (
                  <tr key={dollarTotal} className="text-gray-300">
                    <td className="py-2.5 flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3 text-gray-600" />
                      <span className="tabular-nums">{dollarTotal}.00</span>
                    </td>
                    <td className="py-2.5 text-right text-emerald-400 tabular-nums">
                      ${(royalty / 100).toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right text-gray-400 tabular-nums">
                      ${((cents - royalty) / 100).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-600 mt-4 leading-relaxed">
          The royalty only applies to assets remixed/resold under a{" "}
          <span className="text-gray-400">Commercial</span> license. Royalty-Free assets
          owe no royalty — the buyer owns full rights.
        </p>
      </div>
    </div>
  );
}
