"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SubscriptionPlans from "./SubscriptionPlans";
import {
  CircleNotch,
  PencilSimple,
  TrashSimple,
  Plus,
  FloppyDisk,
  X,
  CurrencyDollar,
  Lightning,
  Ticket,
  CaretDown,
} from "phosphor-react";

// Number inputs without the up/down spinner arrows.
const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

interface CreditPack {
  id: string;
  name: string;
  price: number;
  credits: number;
  description: string;
  features: string[];
  popular: boolean;
  active: boolean;
  sort_order: number;
}

interface ActionCost {
  id: string;
  action: string;
  credits: number;
  note: string;
  icon?: string | null;
  sort_order?: number | null;
}

interface PricingFaq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

interface Discount {
  id: string;
  code: string;
  active: boolean;
  name: string | null;
  coupon_id?: string | null;
  percent_off: number | null;
  amount_off: number | null; // cents
  first_time_only: boolean;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: number | null; // unix seconds
}

export default function SuperAdminPricingPage() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [costs, setCosts] = useState<ActionCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Edit states
  const [editingPack, setEditingPack] = useState<CreditPack | null>(null);
  const [editingCost, setEditingCost] = useState<ActionCost | null>(null);
  const [showNewPack, setShowNewPack] = useState(false);
  const [showNewCost, setShowNewCost] = useState(false);

  // New item forms
  const [newPack, setNewPack] = useState<Partial<CreditPack>>({
    name: "",
    price: 0,
    credits: 0,
    description: "",
    features: [],
    popular: false,
    active: true,
    sort_order: 0,
  });
  const [featuresText, setFeaturesText] = useState("");
  const [editFeaturesText, setEditFeaturesText] = useState("");
  const [newCost, setNewCost] = useState({
    action: "",
    credits: 0,
    note: "",
    icon: "",
    sort_order: 0,
  });

  // Discounts
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [showNewDiscount, setShowNewDiscount] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [newDiscount, setNewDiscount] = useState({
    code: "",
    discountType: "percent" as "percent" | "amount",
    value: 0,
    firstTimeOnly: false,
    maxRedemptions: "",
    expiresAt: "",
  });

  const [faqs, setFaqs] = useState<PricingFaq[]>([]);
  const [showNewFaq, setShowNewFaq] = useState(false);
  const [editingFaq, setEditingFaq] = useState<PricingFaq | null>(null);
  const [faqForm, setFaqForm] = useState({
    question: "",
    answer: "",
    sort_order: 0,
  });

  useEffect(() => {
    fetchData();
    fetchDiscounts();
    fetchFaqs();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pricing");
    const data = await res.json();
    setPacks(data.packs || []);
    setCosts(data.costs || []);
    setLoading(false);
  };

  // ─── Pack CRUD ───

  const savePack = async (pack: CreditPack) => {
    setSaving(pack.id);
    await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "packs",
        id: pack.id,
        data: {
          name: pack.name,
          price: pack.price,
          credits: pack.credits,
          description: pack.description,
          features: pack.features,
          popular: pack.popular,
          active: pack.active,
          sort_order: pack.sort_order,
        },
      }),
    });
    setEditingPack(null);
    setSaving(null);
    fetchData();
  };

  const createPack = async () => {
    if (!newPack.name) return;
    const id = newPack.name!.toLowerCase().replace(/\s+/g, "_");
    setSaving("new_pack");
    await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "packs",
        data: {
          id,
          ...newPack,
          features: featuresText
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
        },
      }),
    });
    setShowNewPack(false);
    setNewPack({
      name: "",
      price: 0,
      credits: 0,
      description: "",
      features: [],
      popular: false,
      active: true,
      sort_order: 0,
    });
    setFeaturesText("");
    setSaving(null);
    fetchData();
  };

  const deletePack = async (id: string) => {
    if (!confirm("Delete this pack?")) return;
    setSaving(id);
    await fetch("/api/admin/pricing", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "packs", id }),
    });
    setSaving(null);
    fetchData();
  };

  // ─── Cost Edit (no add/delete) ───

  const saveCost = async (cost: ActionCost) => {
    setSaving(cost.id);
    await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "costs",
        id: cost.id,
        data: {
          action: cost.action,
          credits: cost.credits,
          note: cost.note,
        },
      }),
    });
    setEditingCost(null);
    setSaving(null);
    fetchData();
  };

  const createCost = async () => {
    const action = newCost.action.trim();
    if (!action) return;

    setSaving("new_cost");
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "costs",
        data: {
          id: action,
          action,
          credits: Number(newCost.credits) || 0,
          note: newCost.note.trim(),
          icon: newCost.icon.trim() || null,
          sort_order: Number(newCost.sort_order) || 0,
        },
      }),
    });
    const data = await res.json();
    setSaving(null);

    if (!res.ok) {
      alert(data.error || "Failed to create action cost");
      return;
    }

    setShowNewCost(false);
    setNewCost({
      action: "",
      credits: 0,
      note: "",
      icon: "",
      sort_order: 0,
    });
    fetchData();
  };

  // ─── Discounts CRUD (Stripe-backed) ───

  const fetchDiscounts = async () => {
    const res = await fetch("/api/admin/discounts");
    const data = await res.json();
    setDiscounts(data.discounts || []);
  };

  const fetchFaqs = async () => {
    const res = await fetch("/api/admin/pricing-faqs");
    const data = await res.json();
    setFaqs(data.faqs || []);
  };

  const createDiscount = async () => {
    if (!newDiscount.code.trim() || !newDiscount.value) return;
    setSaving("new_discount");
    const res = await fetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newDiscount.code.trim().toUpperCase(),
        ...(newDiscount.discountType === "percent"
          ? { percentOff: newDiscount.value }
          : { amountOff: newDiscount.value }),
        firstTimeOnly: newDiscount.firstTimeOnly,
        maxRedemptions: newDiscount.maxRedemptions || undefined,
        expiresAt: newDiscount.expiresAt || undefined,
      }),
    });
    const data = await res.json();
    setSaving(null);
    if (!res.ok) {
      alert(data.error || "Failed to create discount");
      return;
    }
    setShowNewDiscount(false);
    setNewDiscount({
      code: "",
      discountType: "percent",
      value: 0,
      firstTimeOnly: false,
      maxRedemptions: "",
      expiresAt: "",
    });
    fetchDiscounts();
  };

  const toggleDiscount = async (d: Discount) => {
    setSaving(d.id);
    await fetch("/api/admin/discounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, active: !d.active }),
    });
    setSaving(null);
    fetchDiscounts();
  };

  const deleteDiscount = async (d: Discount) => {
    if (!confirm(`Delete discount code "${d.code}"?`)) return;
    setSaving(`delete_${d.id}`);
    const res = await fetch("/api/admin/discounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, couponId: d.coupon_id }),
    });
    const data = await res.json();
    setSaving(null);
    if (!res.ok) {
      alert(data.error || "Failed to delete discount");
      return;
    }
    fetchDiscounts();
  };

  const openNewFaq = () => {
    setEditingFaq(null);
    setFaqForm({
      question: "",
      answer: "",
      sort_order: faqs.length,
    });
    setShowNewFaq(true);
  };

  const openEditFaq = (faq: PricingFaq) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order,
    });
    setShowNewFaq(false);
  };

  const closeFaqEditor = () => {
    setEditingFaq(null);
    setShowNewFaq(false);
    setFaqForm({ question: "", answer: "", sort_order: 0 });
  };

  const saveFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;

    const isEdit = !!editingFaq;
    setSaving(isEdit ? editingFaq.id : "new_faq");
    const res = await fetch("/api/admin/pricing-faqs", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit ? { id: editingFaq.id } : {}),
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        sort_order: Number(faqForm.sort_order) || 0,
      }),
    });
    const data = await res.json();
    setSaving(null);

    if (!res.ok) {
      alert(data.error || "Failed to save FAQ");
      return;
    }

    closeFaqEditor();
    fetchFaqs();
  };

  const deleteFaq = async (faq: PricingFaq) => {
    if (!confirm(`Delete FAQ "${faq.question}"?`)) return;
    setSaving(`faq_${faq.id}`);
    const res = await fetch("/api/admin/pricing-faqs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: faq.id }),
    });
    const data = await res.json();
    setSaving(null);

    if (!res.ok) {
      alert(data.error || "Failed to delete FAQ");
      return;
    }

    fetchFaqs();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircleNotch size={24} className="animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      <h1 className="text-xl font-bold mb-1">Pricing Management</h1>
      <p className="text-sm text-gray-500 mb-8">
        Manage subscription plans, discount codes, and action costs. Changes
        reflect on the public pricing page instantly.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[2.5fr_1fr] gap-x-8 gap-y-10 items-start">
      {/* ─── Monthly Plans ─── */}
      <div className="lg:col-start-1 min-w-0">
        <SubscriptionPlans interval="month" />
      </div>

      {/* ─── Annual Plans ─── */}
      <div className="lg:col-start-1 min-w-0">
        <SubscriptionPlans interval="year" />
      </div>

      {/* ─── Credit Packs (retired — replaced by subscription plans) ─── */}
      <div className="hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CurrencyDollar size={18} className="text-red-500" weight="duotone" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Credit Packs
            </h2>
          </div>
          <button
            onClick={() => setShowNewPack(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
          >
            <Plus size={12} weight="bold" />
            Add Pack
          </button>
        </div>

        <div className="border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px_60px_60px_100px] gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            <span>Name</span>
            <span>Price</span>
            <span>Credits</span>
            <span>Popular</span>
            <span>Active</span>
            <span className="text-right">Actions</span>
          </div>

          {packs.map((pack) =>
            editingPack?.id === pack.id ? (
              /* ─── Editing Row ─── */
              <div
                key={pack.id}
                className="border-b border-white/5 bg-white/[0.02] p-4 space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Name
                    </label>
                    <input
                      value={editingPack.name}
                      onChange={(e) =>
                        setEditingPack({ ...editingPack, name: e.target.value })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Description
                    </label>
                    <input
                      value={editingPack.description}
                      onChange={(e) =>
                        setEditingPack({
                          ...editingPack,
                          description: e.target.value,
                        })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Price ($)
                    </label>
                    <input
                      type="number"
                      value={editingPack.price}
                      onChange={(e) =>
                        setEditingPack({
                          ...editingPack,
                          price: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Credits
                    </label>
                    <input
                      type="number"
                      value={editingPack.credits}
                      onChange={(e) =>
                        setEditingPack({
                          ...editingPack,
                          credits: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Sort Order
                    </label>
                    <input
                      type="number"
                      value={editingPack.sort_order}
                      onChange={(e) =>
                        setEditingPack({
                          ...editingPack,
                          sort_order: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div className="flex items-end gap-4 pb-1">
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPack.popular}
                        onChange={(e) =>
                          setEditingPack({
                            ...editingPack,
                            popular: e.target.checked,
                          })
                        }
                        className="accent-red-500"
                      />
                      Popular
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPack.active}
                        onChange={(e) =>
                          setEditingPack({
                            ...editingPack,
                            active: e.target.checked,
                          })
                        }
                        className="accent-red-500"
                      />
                      Active
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Features (one per line)
                  </label>
                  <textarea
                    value={editFeaturesText}
                    onChange={(e) => setEditFeaturesText(e.target.value)}
                    rows={4}
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      savePack({
                        ...editingPack,
                        features: editFeaturesText
                          .split("\n")
                          .map((f) => f.trim())
                          .filter(Boolean),
                      })
                    }
                    disabled={saving === editingPack.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                  >
                    <FloppyDisk size={12} />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingPack(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ─── Display Row ─── */
              <div
                key={pack.id}
                className="grid grid-cols-[1fr_80px_80px_60px_60px_100px] gap-2 px-4 py-3 border-b border-white/5 items-center text-sm hover:bg-white/[0.02] transition-colors"
              >
                <div>
                  <p className="text-white font-medium text-xs">{pack.name}</p>
                  <p className="text-gray-600 text-[10px] truncate">
                    {pack.description}
                  </p>
                </div>
                <span className="text-gray-300 text-xs">${pack.price}</span>
                <span className="text-gray-300 text-xs">
                  {pack.credits.toLocaleString()}
                </span>
                <span
                  className={`text-[10px] ${pack.popular ? "text-red-400" : "text-gray-600"}`}
                >
                  {pack.popular ? "Yes" : "No"}
                </span>
                <span
                  className={`text-[10px] ${pack.active ? "text-green-400" : "text-gray-600"}`}
                >
                  {pack.active ? "Yes" : "No"}
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => {
                      setEditingPack(pack);
                      setEditFeaturesText(
                        (pack.features || []).join("\n")
                      );
                    }}
                    className="p-1.5 text-gray-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <PencilSimple size={14} />
                  </button>
                  <button
                    onClick={() => deletePack(pack.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <TrashSimple size={14} />
                  </button>
                </div>
              </div>
            )
          )}

          {/* New Pack Form */}
          {showNewPack && (
            <div className="border-t border-white/10 bg-white/[0.02] p-4 space-y-3">
              <p className="text-xs font-medium text-red-400 mb-2">
                New Credit Pack
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Name
                  </label>
                  <input
                    value={newPack.name}
                    onChange={(e) =>
                      setNewPack({ ...newPack, name: e.target.value })
                    }
                    placeholder="e.g. Starter Pack"
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Description
                  </label>
                  <input
                    value={newPack.description}
                    onChange={(e) =>
                      setNewPack({ ...newPack, description: e.target.value })
                    }
                    placeholder="Short description"
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    value={newPack.price}
                    onChange={(e) =>
                      setNewPack({
                        ...newPack,
                        price: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Credits
                  </label>
                  <input
                    type="number"
                    value={newPack.credits}
                    onChange={(e) =>
                      setNewPack({
                        ...newPack,
                        credits: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={newPack.sort_order}
                    onChange={(e) =>
                      setNewPack({
                        ...newPack,
                        sort_order: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPack.popular}
                      onChange={(e) =>
                        setNewPack({ ...newPack, popular: e.target.checked })
                      }
                      className="accent-red-500"
                    />
                    Popular
                  </label>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">
                  Features (one per line)
                </label>
                <textarea
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  rows={4}
                  placeholder="100 credits, valid for 30 days&#10;Full platform access&#10;..."
                  className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createPack}
                  disabled={saving === "new_pack"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                >
                  <Plus size={12} weight="bold" />
                  Create Pack
                </button>
                <button
                  onClick={() => setShowNewPack(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Discount Codes ─── */}
      <div className="lg:col-span-2 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Ticket size={16} className="text-red-500" weight="duotone" />
            <h2 className="text-xs font-semibold uppercase tracking-wider">
              Discounts
            </h2>
          </div>
          {!showNewDiscount && (
            <button
              onClick={() => setShowNewDiscount(true)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
            >
              <Plus size={10} weight="bold" />
              Add
            </button>
          )}
        </div>

        {/* New discount form (animated open/close, stacked to fit narrow column) */}
        <AnimatePresence initial={false}>
          {showNewDiscount && (
            <motion.div
              key="discount-form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="border border-white/10 bg-white/[0.02] p-3 space-y-2.5 mb-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Code
                  </label>
                  <input
                    value={newDiscount.code}
                    onChange={(e) =>
                      setNewDiscount({
                        ...newDiscount,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="CREATOR2026"
                    className="w-full bg-white/[0.03] border border-white/10 px-2.5 py-1.5 text-xs text-white font-mono uppercase placeholder:normal-case focus:outline-none focus:border-red-500/50"
                  />
                </div>
                {/* Value + type combined into one control */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Discount
                  </label>
                  <div className="flex items-stretch border border-white/10 focus-within:border-red-500/50 transition-colors">
                    <input
                      type="number"
                      value={newDiscount.value || ""}
                      onChange={(e) =>
                        setNewDiscount({
                          ...newDiscount,
                          value: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="50"
                      className={`min-w-0 flex-1 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white focus:outline-none ${NO_SPINNER}`}
                    />
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setTypeMenuOpen((o) => !o)}
                        className="h-full flex items-center gap-1.5 bg-white/[0.05] border-l border-white/10 pl-2.5 pr-2 py-1.5 text-xs text-white cursor-pointer hover:bg-white/[0.08] transition-colors"
                      >
                        {newDiscount.discountType === "percent"
                          ? "% off"
                          : "$ off"}
                        <CaretDown
                          size={11}
                          className={`text-gray-400 transition-transform duration-200 ${
                            typeMenuOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence>
                        {typeMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setTypeMenuOpen(false)}
                            />
                            <motion.div
                              initial={{ opacity: 0, y: -4, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.97 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="absolute right-0 top-full mt-1 z-20 w-24 border border-white/10 bg-neutral-900 shadow-xl shadow-black/50 overflow-hidden"
                            >
                              {[
                                { v: "percent" as const, label: "% off" },
                                { v: "amount" as const, label: "$ off" },
                              ].map((opt) => (
                                <button
                                  key={opt.v}
                                  type="button"
                                  onClick={() => {
                                    setNewDiscount({
                                      ...newDiscount,
                                      discountType: opt.v,
                                    });
                                    setTypeMenuOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                    newDiscount.discountType === opt.v
                                      ? "bg-red-600/20 text-red-400"
                                      : "text-gray-300 hover:bg-white/[0.06]"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Max uses (optional)
                  </label>
                  <input
                    type="number"
                    value={newDiscount.maxRedemptions}
                    onChange={(e) =>
                      setNewDiscount({
                        ...newDiscount,
                        maxRedemptions: e.target.value,
                      })
                    }
                    placeholder="Unlimited"
                    className={`w-full bg-white/[0.03] border border-white/10 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Expires (optional)
                  </label>
                  <input
                    type="date"
                    value={newDiscount.expiresAt}
                    onChange={(e) =>
                      setNewDiscount({
                        ...newDiscount,
                        expiresAt: e.target.value,
                      })
                    }
                    className="w-full bg-white/[0.03] border border-white/10 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDiscount.firstTimeOnly}
                    onChange={(e) =>
                      setNewDiscount({
                        ...newDiscount,
                        firstTimeOnly: e.target.checked,
                      })
                    }
                  />
                  First-time buyers only
                </label>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={createDiscount}
                    disabled={saving === "new_discount"}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                  >
                    {saving === "new_discount" ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : (
                      <FloppyDisk size={12} />
                    )}
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewDiscount(false)}
                    className="px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compact card list */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {discounts.length === 0 && !showNewDiscount && (
            <div className="border border-white/10 px-3 py-6 text-center text-xs text-gray-600 xl:col-span-2">
              No discount codes yet.
            </div>
          )}
          {discounts.map((d) => (
            <div key={d.id} className="border border-white/10 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-mono text-xs text-white truncate">
                  {d.code}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleDiscount(d)}
                    disabled={saving === d.id}
                    className={`shrink-0 px-2 py-0.5 text-[10px] border cursor-pointer transition-colors ${
                      d.active
                        ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        : "border-white/10 text-gray-500 hover:text-white"
                    }`}
                  >
                    {d.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => deleteDiscount(d)}
                    disabled={saving === `delete_${d.id}`}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                    aria-label={`Delete ${d.code}`}
                  >
                    {saving === `delete_${d.id}` ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : (
                      <TrashSimple size={14} />
                    )}
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-gray-400 flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="text-gray-200">
                  {d.percent_off
                    ? `${d.percent_off}% off`
                    : d.amount_off
                      ? `$${(d.amount_off / 100).toFixed(2)} off`
                      : "—"}
                </span>
                {d.first_time_only && <span>· first-time</span>}
                <span>
                  · {d.times_redeemed}
                  {d.max_redemptions ? `/${d.max_redemptions}` : ""} used
                </span>
                {d.expires_at && (
                  <span>
                    · exp {new Date(d.expires_at * 1000).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Pricing FAQs ─── */}
      <div className="lg:col-span-2 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider">
              Pricing FAQs
            </h2>
            <p className="mt-1 text-[11px] text-gray-500">
              These questions appear on the public pricing page.
            </p>
          </div>
          {!showNewFaq && !editingFaq && (
            <button
              onClick={openNewFaq}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
            >
              <Plus size={10} weight="bold" />
              Add
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {(showNewFaq || editingFaq) && (
            <motion.div
              key="faq-form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="border border-white/10 bg-white/[0.02] p-3 space-y-3 mb-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Question
                  </label>
                  <input
                    value={faqForm.question}
                    onChange={(e) =>
                      setFaqForm({ ...faqForm, question: e.target.value })
                    }
                    placeholder="How do credits work on subscriptions?"
                    className="w-full bg-white/[0.03] border border-white/10 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Answer
                  </label>
                  <textarea
                    value={faqForm.answer}
                    onChange={(e) =>
                      setFaqForm({ ...faqForm, answer: e.target.value })
                    }
                    rows={4}
                    className="w-full bg-white/[0.03] border border-white/10 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 resize-none"
                  />
                </div>
                <div className="w-28">
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Order
                  </label>
                  <input
                    type="number"
                    value={faqForm.sort_order}
                    onChange={(e) =>
                      setFaqForm({
                        ...faqForm,
                        sort_order: parseInt(e.target.value) || 0,
                      })
                    }
                    className={`w-full bg-white/[0.03] border border-white/10 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveFaq}
                    disabled={saving === "new_faq" || saving === editingFaq?.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                  >
                    {saving === "new_faq" || saving === editingFaq?.id ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : (
                      <FloppyDisk size={12} />
                    )}
                    {editingFaq ? "Save FAQ" : "Create FAQ"}
                  </button>
                  <button
                    onClick={closeFaqEditor}
                    className="px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-3">
          {faqs.length === 0 && !showNewFaq && (
            <div className="border border-white/10 px-3 py-6 text-center text-xs text-gray-600">
              No FAQs yet.
            </div>
          )}
          {faqs.map((faq) => (
            <div key={faq.id} className="border border-white/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">
                    {faq.question}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                    {faq.answer}
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-600">
                    Order {faq.sort_order}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEditFaq(faq)}
                    className="p-1.5 text-gray-500 hover:text-white transition-colors cursor-pointer"
                    aria-label={`Edit ${faq.question}`}
                  >
                    <PencilSimple size={14} />
                  </button>
                  <button
                    onClick={() => deleteFaq(faq)}
                    disabled={saving === `faq_${faq.id}`}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                    aria-label={`Delete ${faq.question}`}
                  >
                    {saving === `faq_${faq.id}` ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : (
                      <TrashSimple size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Action Costs ─── */}
      <div className="lg:col-start-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Lightning size={18} className="text-red-500" weight="duotone" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Action Costs
            </h2>
          </div>
          <button
            onClick={() => setShowNewCost((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
          >
            <Plus size={12} weight="bold" />
            {showNewCost ? "Close" : "Add Action Cost"}
          </button>
        </div>

        <div className="border border-white/10 overflow-hidden">
          {showNewCost && (
            <div className="border-b border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Action Key
                  </label>
                  <input
                    value={newCost.action}
                    onChange={(e) =>
                      setNewCost({
                        ...newCost,
                        action: e.target.value.trim().toLowerCase().replace(/\s+/g, "_"),
                      })
                    }
                    placeholder="remix_video_5s"
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Credits
                  </label>
                  <input
                    type="number"
                    value={newCost.credits}
                    onChange={(e) =>
                      setNewCost({
                        ...newCost,
                        credits: parseInt(e.target.value) || 0,
                      })
                    }
                    className={`w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Note
                  </label>
                  <input
                    value={newCost.note}
                    onChange={(e) =>
                      setNewCost({
                        ...newCost,
                        note: e.target.value,
                      })
                    }
                    placeholder="Remix — Video Generation (5s)"
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Icon
                  </label>
                  <input
                    value={newCost.icon}
                    onChange={(e) =>
                      setNewCost({
                        ...newCost,
                        icon: e.target.value,
                      })
                    }
                    placeholder="Video"
                    className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={newCost.sort_order}
                    onChange={(e) =>
                      setNewCost({
                        ...newCost,
                        sort_order: parseInt(e.target.value) || 0,
                      })
                    }
                    className={`w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 ${NO_SPINNER}`}
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500">
                Use the exact backend action key, for example
                {" "}
                <span className="text-gray-400">decision_layer_image</span>
                {" "}
                or
                {" "}
                <span className="text-gray-400">remix_video_10s</span>.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={createCost}
                  disabled={saving === "new_cost"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                >
                  {saving === "new_cost" ? (
                    <CircleNotch size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} weight="bold" />
                  )}
                  Create Action Cost
                </button>
                <button
                  onClick={() => {
                    setShowNewCost(false);
                    setNewCost({
                      action: "",
                      credits: 0,
                      note: "",
                      icon: "",
                      sort_order: 0,
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <X size={12} />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_1fr_60px] gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            <span>Action</span>
            <span>Credits</span>
            <span>Note</span>
            <span className="text-right">Edit</span>
          </div>

          {costs.map((cost) =>
            editingCost?.id === cost.id ? (
              <div
                key={cost.id}
                className="border-b border-white/5 bg-white/[0.02] p-4 space-y-3"
              >
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Action
                    </label>
                    <span className="text-xs text-gray-400">{editingCost.action}</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Credits
                    </label>
                    <input
                      type="number"
                      value={editingCost.credits}
                      onChange={(e) =>
                        setEditingCost({
                          ...editingCost,
                          credits: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">
                      Note
                    </label>
                    <input
                      value={editingCost.note}
                      onChange={(e) =>
                        setEditingCost({
                          ...editingCost,
                          note: e.target.value,
                        })
                      }
                      className="w-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveCost(editingCost)}
                    disabled={saving === editingCost.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                  >
                    <FloppyDisk size={12} />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingCost(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={cost.id}
                className="grid grid-cols-[1fr_80px_1fr_60px] gap-2 px-4 py-3 border-b border-white/5 items-center text-sm hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-white text-xs font-medium">
                  {cost.action}
                </span>
                <span
                  className={`text-xs font-semibold ${cost.credits === 0 ? "text-red-400" : "text-gray-300"}`}
                >
                  {cost.credits === 0 ? "Free" : cost.credits}
                </span>
                <span className="text-gray-500 text-[10px] truncate">
                  {cost.note}
                </span>
                <div className="flex justify-end">
                  <button
                    onClick={() => setEditingCost(cost)}
                    className="p-1.5 text-gray-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <PencilSimple size={14} />
                  </button>
                </div>
              </div>
            )
          )}

          {costs.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-600 text-xs">
              No action costs configured yet.
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
