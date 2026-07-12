"use client";

import { useEffect, useState } from "react";
import {
  Lightning,
  Plus,
  PencilSimple,
  Trash,
  FloppyDisk,
  X,
  CalendarBlank,
  Info,
} from "phosphor-react";

interface Pack {
  id?: string;
  name: string;
  credits: number;
  price: number;
  description?: string;
  tier: "month" | "year";
  popular?: boolean;
  active?: boolean;
  sort_order?: number;
}

const emptyPack = (tier: "month" | "year"): Pack => ({
  name: "",
  credits: 0,
  price: 0,
  description: "",
  tier,
  popular: false,
  active: true,
  sort_order: 0,
});

function PackSection({ tier }: { tier: "month" | "year" }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Pack | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnnual = tier === "year";
  const label = isAnnual ? "Annual" : "Monthly";
  const days = isAnnual ? 365 : 30;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pricing");
      const data = await res.json();
      const all: Pack[] = (data.packs || []).filter(
        (p: Pack) => (p.tier || "month") === tier,
      );
      all.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setPacks(all);
    } catch {
      setError("Failed to load packs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || form.credits <= 0 || form.price <= 0) {
      setError("Name, credits and price are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        credits: Number(form.credits),
        price: Number(form.price),
        description: form.description?.trim() || "",
        tier,
        popular: !!form.popular,
        active: form.active !== false,
        sort_order: Number(form.sort_order) || 0,
      };

      const res = form.id
        ? await fetch("/api/admin/pricing", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table: "packs", id: form.id, data: payload }),
          })
        : await fetch("/api/admin/pricing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table: "packs", data: payload }),
          });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setForm(null);
      await load();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: string) => {
    if (!id) return;
    if (!confirm("Delete this pack? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "packs", id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Delete failed");
      }
      await load();
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  return (
    <section className="border border-white/10 rounded-lg p-5 mb-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isAnnual ? (
            <CalendarBlank size={22} weight="duotone" className="text-amber-400" />
          ) : (
            <Lightning size={22} weight="duotone" className="text-red-400" />
          )}
          <div>
            <h2 className="text-base font-semibold">{label} Top-Up Packs</h2>
            <p className="text-xs text-gray-500">
              Credits from these packs stay valid for {days} days.
            </p>
          </div>
        </div>
        {!form && (
          <button
            onClick={() => setForm(emptyPack(tier))}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors cursor-pointer"
          >
            <Plus size={16} weight="bold" /> Add {label.toLowerCase()} pack
          </button>
        )}
      </div>

      {/* Plain-language explainer */}
      <div
        className={`mb-4 flex items-start gap-2 text-[11px] rounded px-3 py-2 border ${
          isAnnual
            ? "text-amber-200/80 bg-amber-500/10 border-amber-500/20"
            : "text-blue-200/80 bg-blue-500/10 border-blue-500/20"
        }`}
      >
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          {isAnnual ? (
            <>
              <b>Annual packs</b> give credits that last <b>365 days</b>. They
              are shown <b>only to annual subscribers</b> on the Top Up page.
            </>
          ) : (
            <>
              <b>Monthly packs</b> give credits that last <b>30 days</b>. They
              are shown to <b>both monthly and annual subscribers</b>.
            </>
          )}
        </span>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Add / Edit form */}
      {form && (
        <div className="mb-5 border border-white/15 rounded-lg p-4 bg-white/[0.02]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">
                Pack name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Starter"
                className="w-full bg-black border border-white/15 rounded px-3 py-2 text-sm focus:border-white/40 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">
                Sort order
              </label>
              <input
                type="number"
                value={form.sort_order ?? 0}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
                className="w-full bg-black border border-white/15 rounded px-3 py-2 text-sm focus:border-white/40 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">
                Credits
              </label>
              <input
                type="number"
                value={form.credits || ""}
                onChange={(e) =>
                  setForm({ ...form, credits: Number(e.target.value) })
                }
                placeholder="350"
                className="w-full bg-black border border-white/15 rounded px-3 py-2 text-sm focus:border-white/40 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">
                Price (USD)
              </label>
              <input
                type="number"
                value={form.price || ""}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
                placeholder="75"
                className="w-full bg-black border border-white/15 rounded px-3 py-2 text-sm focus:border-white/40 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-gray-400 mb-1">
                Description (optional)
              </label>
              <input
                value={form.description || ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Great for occasional use"
                className="w-full bg-black border border-white/15 rounded px-3 py-2 text-sm focus:border-white/40 outline-none"
              />
            </div>
          </div>

          <div className="mt-3 text-[11px] text-gray-400">
            Credits from this pack will be valid for{" "}
            <b className="text-white">{days} days</b>.
          </div>

          <div className="flex items-center gap-5 mt-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.popular}
                onChange={(e) =>
                  setForm({ ...form, popular: e.target.checked })
                }
              />
              Mark as popular
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active
            </label>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-md transition-colors cursor-pointer"
            >
              <FloppyDisk size={16} weight="bold" />
              {saving ? "Saving..." : form.id ? "Update pack" : "Create pack"}
            </button>
            <button
              onClick={() => {
                setForm(null);
                setError(null);
              }}
              className="flex items-center gap-1.5 text-xs px-4 py-2 bg-white/5 hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            >
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="text-sm text-gray-500">
          No {label.toLowerCase()} packs yet. Add one above.
        </p>
      ) : (
        <div className="space-y-2">
          {packs.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border border-white/10 rounded-lg px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.popular && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                      Popular
                    </span>
                  )}
                  {p.active === false && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.credits.toLocaleString()} credits — ${p.price} · valid{" "}
                  {days} days
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setForm({ ...p })}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded cursor-pointer"
                  title="Edit"
                >
                  <PencilSimple size={16} />
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded cursor-pointer"
                  title="Delete"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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

      {/* How it works — for the non-technical admin */}
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
            These are <b>one-time</b> purchases — not recurring. Buying a pack
            never shortens a longer existing expiry.
          </li>
        </ul>
      </div>

      <PackSection tier="month" />
      <PackSection tier="year" />
    </div>
  );
}
