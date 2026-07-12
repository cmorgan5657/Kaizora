"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Check,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type License = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_multiplier: number;
  is_active: boolean;
};

const EMPTY_FORM = {
  id: "",
  name: "",
  slug: "",
  description: "",
  price_multiplier: "1",
  is_active: true,
};

const INPUT =
  "w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] font-light text-white outline-none transition-colors focus:border-red-500/40 placeholder:text-white/25";

export default function LicensesAdminPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/licenses", {
      headers: { Authorization: `Bearer ${await token()}` },
      cache: "no-store",
    });
    const json = await res.json();
    if (res.ok) setLicenses(json.licenses || []);
    else showToast("error", json.error || "Failed to load");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditing(false);
    setModalOpen(true);
  }

  function openEdit(l: License) {
    setForm({
      id: l.id,
      name: l.name,
      slug: l.slug,
      description: l.description || "",
      price_multiplier: String(l.price_multiplier),
      is_active: l.is_active,
    });
    setEditing(true);
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      showToast("error", "Name is required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/licenses", {
      method: editing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) {
      showToast("success", editing ? "License updated" : "License created");
      setModalOpen(false);
      load();
    } else {
      showToast("error", json.error || "Failed to save");
    }
  }

  async function toggleActive(l: License) {
    const res = await fetch("/api/admin/licenses", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({ id: l.id, is_active: !l.is_active }),
    });
    if (res.ok) {
      setLicenses((prev) =>
        prev.map((x) => (x.id === l.id ? { ...x, is_active: !x.is_active } : x)),
      );
    } else {
      showToast("error", "Failed to update");
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/licenses?id=${deleteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setLicenses((prev) => prev.filter((x) => x.id !== deleteId));
      showToast("success", "License deleted");
    } else {
      showToast("error", json.error || "Failed to delete");
    }
    setDeleteId(null);
  }

  const activeCount = licenses.filter((l) => l.is_active).length;

  return (
    <div className="text-white">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 border ${
            toast.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
              : "bg-red-500/10 border-red-500/40 text-red-400"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          <span className="text-sm font-light">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extralight tracking-tight">
            License Types
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            {licenses.length} total · {activeCount} active
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-sm font-light rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New License
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-600">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : licenses.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl py-20 text-center">
          <p className="text-sm text-gray-500 font-light mb-3">
            No license types yet
          </p>
          <button
            onClick={openCreate}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            + Create your first license
          </button>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/[0.06]">
          {licenses.map((l) => (
            <div
              key={l.id}
              className={`flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.02] ${
                l.is_active ? "" : "opacity-50"
              }`}
            >
              {/* Left: name + slug + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-1">
                  <div className="min-w-0 w-48 shrink-0">
                    <div className="text-sm font-light truncate">{l.name}</div>
                    <code className="text-[11px] text-gray-600">{l.slug}</code>
                  </div>
                  <div className="w-16 shrink-0 text-sm font-light text-red-400">
                    ×{Number(l.price_multiplier).toFixed(2)}
                  </div>
                </div>
                <div className="text-xs text-gray-500 font-light leading-relaxed">
                  {l.description || "—"}
                </div>
              </div>

              {/* Active toggle */}
              <Toggle on={l.is_active} onClick={() => toggleActive(l)} />

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(l)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteId(l.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !saving && setModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-[#0c0c0c] border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-base font-light">
                {editing ? "Edit License" : "New License"}
              </h3>
              <button
                onClick={() => !saving && setModalOpen(false)}
                className="text-gray-600 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Commercial"
                  className={INPUT}
                />
              </Field>

              <Field label="Slug">
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="Auto-generated from name"
                  className={INPUT}
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={2}
                  placeholder="What the buyer is allowed to do"
                  className={`${INPUT} resize-none`}
                />
              </Field>

              <Field label="Price Multiplier">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.price_multiplier}
                  onChange={(e) =>
                    setForm({ ...form, price_multiplier: e.target.value })
                  }
                  className={INPUT}
                />
              </Field>

              <ToggleRow
                icon={CheckCircle2}
                label="Active"
                on={form.is_active}
                onToggle={() => setForm({ ...form, is_active: !form.is_active })}
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/10">
              <button
                onClick={() => !saving && setModalOpen(false)}
                className="px-4 py-2 text-sm font-light text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-light bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setDeleteId(null)}
          />
          <div className="relative w-full max-w-sm bg-[#0c0c0c] border border-white/10 rounded-2xl p-6">
            <h3 className="text-base font-light mb-2">Delete this license?</h3>
            <p className="text-sm text-gray-500 font-light mb-5">
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-light text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex items-center gap-2 px-4 py-2 text-sm font-light bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 cursor-pointer">
      <span
        className={`relative block w-9 h-5 rounded-full transition-colors ${
          on ? "bg-emerald-500/80" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  on,
  onToggle,
}: {
  icon: any;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
    >
      <span className="flex items-center gap-2.5 text-[13px] font-light text-gray-300">
        <Icon className="w-4 h-4 text-gray-500" />
        {label}
      </span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${
          on ? "bg-emerald-500/80" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all flex items-center justify-center ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        >
          {on && <Check className="w-2.5 h-2.5 text-emerald-600" />}
        </span>
      </span>
    </button>
  );
}
