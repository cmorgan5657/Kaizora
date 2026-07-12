"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CircleNotch,
  PencilSimple,
  TrashSimple,
  Plus,
  FloppyDisk,
  CalendarBlank,
  CalendarCheck,
} from "phosphor-react";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  credits: number;
  price: number;
  billing_interval: "month" | "year";
  discount_percent: number; // advertised "save X%" badge shown on the plan
  popular: boolean;
  active: boolean;
  sort_order: number;
}

const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const emptyPlan = {
  name: "",
  description: "",
  credits: 0,
  price: 0,
  discount_percent: 0,
  popular: false,
  active: true,
  sort_order: 0,
};

/**
 * Manages subscription plans for ONE billing interval (month or year).
 * Rendered twice on the pricing admin — a fully separate section each.
 */
export default function SubscriptionPlans({
  interval,
}: {
  interval: "month" | "year";
}) {
  const isYear = interval === "year";
  const per = isYear ? "year" : "month";
  const accent = isYear ? "emerald" : "sky";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>(emptyPlan);
  const [featuresText, setFeaturesText] = useState("");

  const fetchPlans = async () => {
    const res = await fetch(`/api/admin/plans?interval=${interval}`);
    const data = await res.json();
    setPlans(data.plans || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  const openNew = () => {
    setForm(emptyPlan);
    setFeaturesText("");
    setShowNew(true);
    setEditing(null);
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({ ...p });
    setFeaturesText((p.features || []).join("\n"));
    setShowNew(false);
  };

  const cancel = () => {
    setShowNew(false);
    setEditing(null);
  };

  const submit = async () => {
    if (!form.name) return;
    const isEdit = !!editing;
    setSaving(isEdit ? editing!.id : "new");
    const body = {
      ...(isEdit ? { id: editing!.id } : {}),
      name: form.name,
      description: form.description,
      credits: Number(form.credits) || 0,
      price: Number(form.price) || 0,
      billing_interval: interval,
      discount_percent: Number(form.discount_percent) || 0,
      popular: !!form.popular,
      active: form.active ?? true,
      sort_order: Number(form.sort_order) || 0,
      features: featuresText
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
    };
    const res = await fetch("/api/admin/plans", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(null);
    if (!res.ok) {
      alert(d.error || "Failed to save plan");
      return;
    }
    cancel();
    fetchPlans();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this plan? Its Stripe product will be archived."))
      return;
    setSaving(id);
    await fetch("/api/admin/plans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSaving(null);
    fetchPlans();
  };

  const Icon = isYear ? CalendarCheck : CalendarBlank;

  // Live figures for the annual preview panel
  const fPrice = Number(form.price) || 0;
  const fCredits = Number(form.credits) || 0;
  const fDiscount = Number(form.discount_percent) || 0;
  const fOriginal =
    fDiscount > 0 && fDiscount < 100 ? fPrice / (1 - fDiscount / 100) : fPrice;
  const fSavings = Math.max(0, fOriginal - fPrice);

  const formFields = (
    <div className="border border-white/10 bg-white/[0.02] p-4 space-y-3 mb-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={isYear ? "Creator (Annual)" : "Creator"}
            className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">
            Description
          </label>
          <input
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">
            Price ($ / {per})
          </label>
          <input
            type="number"
            value={form.price || ""}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder={isYear ? "240" : "25"}
            className={`w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">
            Credits (per month)
          </label>
          <input
            type="number"
            value={form.credits || ""}
            onChange={(e) => setForm({ ...form, credits: e.target.value })}
            placeholder={isYear ? "1200" : "100"}
            className={`w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
          />
        </div>
      </div>

      {isYear && (
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">
            Discount badge to show (%)
          </label>
          <input
            type="number"
            value={form.discount_percent || ""}
            onChange={(e) =>
              setForm({ ...form, discount_percent: e.target.value })
            }
            placeholder="20"
            className={`w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
          />
          <p className="text-[10px] text-gray-600 mt-1">
            Advertised savings shown on the plan (e.g. “Save{" "}
            {Number(form.discount_percent) || 0}%”). 0 = no badge.
          </p>
        </div>
      )}

      {/* Live preview (annual only) */}
      {isYear && (
        <div className="border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed">
          <p className="text-gray-300">
            Customer pays{" "}
            <span className="text-white font-semibold">
              ${fPrice.toFixed(2)}/year
            </span>{" "}
            <span className="text-emerald-400">
              (${(fPrice / 12).toFixed(2)}/mo)
            </span>
          </p>
          {fDiscount > 0 && (
            <p className="text-gray-400 mt-0.5">
              Badge “Save {fDiscount}%”: was{" "}
              <span className="line-through text-gray-500">
                ${fOriginal.toFixed(2)}
              </span>
              , saves <span className="text-white">${fSavings.toFixed(2)}</span>
            </p>
          )}
          <p className="text-gray-500 mt-0.5">
            {fCredits.toLocaleString()} credits per month · billed annually
          </p>
        </div>
      )}

      <div>
        <label className="text-[10px] text-gray-500 mb-1 block">
          Features (one per line)
        </label>
        <textarea
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          rows={3}
          placeholder={"100 credits\nAll tools included"}
          className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
        />
      </div>

      <div className="flex items-center gap-5 text-xs text-gray-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.popular}
            onChange={(e) => setForm({ ...form, popular: e.target.checked })}
          />
          Popular
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active ?? true}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Order</span>
          <input
            type="number"
            value={form.sort_order || 0}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            className={`w-16 bg-white/[0.03] border border-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={submit}
          disabled={saving !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <CircleNotch size={12} className="animate-spin" />
          ) : (
            <FloppyDisk size={12} />
          )}
          {editing ? "Save" : "Create"} & sync to Stripe
        </button>
        <button
          onClick={cancel}
          className="px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={18} className={`text-${accent}-400`} weight="duotone" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {isYear ? "Annual" : "Monthly"} Plans
          </h2>
        </div>
        {!showNew && !editing && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
          >
            <Plus size={12} weight="bold" />
            Add {isYear ? "Annual" : "Monthly"} Plan
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {(showNew || editing) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {formFields}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <CircleNotch size={20} className="animate-spin text-gray-500" />
        </div>
      ) : (
        <div className="border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_70px_70px] gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            <span>Plan</span>
            <span>Price</span>
            <span>Credits</span>
            <span className="text-right">Actions</span>
          </div>

          {plans.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-600">
              No {isYear ? "annual" : "monthly"} plans yet.
            </div>
          )}

          {plans.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_100px_70px_70px] gap-2 px-4 py-3 border-b border-white/5 items-center text-xs"
            >
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="text-white truncate">{p.name}</span>
                {p.discount_percent > 0 && (
                  <span className="text-[8px] px-1 py-0.5 bg-emerald-500/10 text-emerald-400 uppercase whitespace-nowrap">
                    Save {p.discount_percent}%
                  </span>
                )}
                {p.popular && (
                  <span className="text-[8px] px-1 py-0.5 bg-red-500/10 text-red-400 uppercase">
                    Popular
                  </span>
                )}
                {!p.active && (
                  <span className="text-[8px] px-1 py-0.5 bg-white/5 text-gray-500 uppercase">
                    Off
                  </span>
                )}
              </div>
              <span className="text-gray-300">
                ${Number(p.price).toFixed(0)}/{per === "year" ? "yr" : "mo"}
              </span>
              <span className="text-gray-400">{p.credits}</span>
              <span className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openEdit(p)}
                  className="p-1.5 text-gray-500 hover:text-white cursor-pointer"
                >
                  <PencilSimple size={14} />
                </button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={saving === p.id}
                  className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer disabled:opacity-50"
                >
                  <TrashSimple size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
