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
  Info,
  DollarSign,
} from "lucide-react";

export default function PlatformFeePage() {
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentFee, setCurrentFee] = useState<number>(10);
  const [inputFee, setInputFee] = useState<string>("10");
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
      if (t) await loadFee(t);
    }
    init();
  }, []);

  async function loadFee(t: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-fee", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      setCurrentFee(data.platform_fee_percent ?? 10);
      setInputFee(String(data.platform_fee_percent ?? 10));
      setUpdatedAt(data.updated_at || null);
      setIsDefault(!!data.is_default);
      setDbError(data.db_error || null);
    } catch (e: any) {
      setErrorMsg(e.message);
    }
    setLoading(false);
  }

  async function handleSave() {
    const num = Number(inputFee);
    if (isNaN(num) || num < 0 || num > 100) {
      setErrorMsg("Enter a value between 0 and 100");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/platform-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fee_percent: num }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentFee(num);
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

  // Preview: what does this fee mean for example transactions?
  const preview = (cents: number) => {
    const fee = Math.floor((cents * currentFee) / 100);
    return {
      total: cents,
      platform: fee,
      seller: cents - fee,
    };
  };

  const examples = [preview(1000), preview(5000), preview(15000), preview(50000)];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-light flex items-center gap-2">
          <Percent className="w-5 h-5 text-red-500" />
          Platform Fee
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          The cut Kaizora takes from every asset and bundle transaction. Applies platform-wide.
        </p>
      </div>

      {/* DB error banner */}
      {dbError && (
        <div className="p-4 border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs space-y-2">
            <p className="text-yellow-300">
              Setting persistence is unavailable. The platform is using the default {currentFee}% fee.
            </p>
            <p className="text-gray-500 font-mono leading-relaxed bg-black/40 p-2 border border-white/5">
              {dbError}
            </p>
            <p className="text-gray-500">
              Run this SQL in Supabase to enable persistence:
            </p>
            <pre className="text-[10px] text-emerald-300 font-mono bg-black/60 p-3 border border-white/5 overflow-x-auto leading-snug">
{`CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value_number numeric,
  value_text text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO platform_settings (key, value_number)
VALUES ('platform_fee_percent', 10)
ON CONFLICT (key) DO NOTHING;`}
            </pre>
          </div>
        </div>
      )}

      {/* Current fee card */}
      <div className="border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-5xl font-light text-white tabular-nums">{currentFee}</span>
          <span className="text-xl text-gray-500">%</span>
          {isDefault && (
            <span className="text-[10px] px-2 py-0.5 border border-yellow-500/30 text-yellow-400 uppercase tracking-wider">
              default
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Current platform fee on every sale</p>
        {updatedAt && (
          <p className="text-[10px] text-gray-600 mt-2">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Edit fee */}
      <div className="border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
            Adjust Fee Percentage
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={inputFee}
                onChange={(e) => setInputFee(e.target.value)}
                className="w-full bg-black border border-white/15 px-4 py-3 pr-10 text-2xl font-light tabular-nums focus:outline-none focus:border-red-500/50"
              />
              <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || Number(inputFee) === currentFee}
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

        {/* Quick preset buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Presets:</span>
          {[5, 10, 15, 20, 25, 30].map((p) => (
            <button
              key={p}
              onClick={() => setInputFee(String(p))}
              className={`text-xs px-2.5 py-1 border transition-colors ${
                Number(inputFee) === p
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
            Live Preview · {Number(inputFee) || 0}% fee
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                <th className="text-left pb-3 font-light">Sale Total</th>
                <th className="text-right pb-3 font-light">Platform Fee</th>
                <th className="text-right pb-3 font-light">Seller Receives</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[10, 50, 150, 500].map((dollarTotal) => {
                const cents = dollarTotal * 100;
                const fee = Math.floor((cents * (Number(inputFee) || 0)) / 100);
                return (
                  <tr key={dollarTotal} className="text-gray-300">
                    <td className="py-2.5 flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3 text-gray-600" />
                      <span className="tabular-nums">{dollarTotal}.00</span>
                    </td>
                    <td className="py-2.5 text-right text-yellow-400 tabular-nums">
                      ${(fee / 100).toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right text-emerald-400 tabular-nums">
                      ${((cents - fee) / 100).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info card */}
      <div className="border border-white/10 bg-white/[0.02] p-5 text-xs text-gray-400 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-gray-300 uppercase tracking-wider text-[10px]">Where this applies</span>
        </div>
        <ul className="space-y-1.5 list-none pl-5">
          <li className="flex gap-2"><span className="text-gray-600">·</span> Individual asset purchases (`/api/create-payment-intent`)</li>
          <li className="flex gap-2"><span className="text-gray-600">·</span> Bundle purchases (`/api/bundles/[id]/complete`)</li>
          <li className="flex gap-2"><span className="text-gray-600">·</span> Transaction records (logged in `transactions.platform_fee_cents`)</li>
          <li className="flex gap-2"><span className="text-gray-600">·</span> Stripe transfer to seller (seller gets `total - fee`)</li>
        </ul>
        <p className="text-gray-600 pt-2 border-t border-white/5 mt-3">
          Changes apply to all <strong className="text-gray-400">future</strong> transactions — past transactions keep their original fee.
        </p>
      </div>
    </div>
  );
}
