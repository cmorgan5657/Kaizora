"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPagination from "@/app/components/AdminPagination";
import {
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ExternalLink,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

type Notice = {
  id: string;
  complainant_name: string;
  complainant_email: string;
  complainant_phone: string | null;
  complainant_address: string;
  copyrighted_work: string;
  infringing_url: string;
  signature: string;
  status: "pending" | "actioned" | "dismissed";
  created_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  actioned: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  dismissed: "bg-white/[0.04] text-gray-500 border-white/10",
};

const PAGE_SIZE = 15;

export default function DmcaAdminPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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
    const res = await fetch("/api/admin/dmca", {
      headers: { Authorization: `Bearer ${await token()}` },
      cache: "no-store",
    });
    const json = await res.json();
    if (res.ok) setNotices(json.notices || []);
    else showToast("error", json.error || "Failed to load");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: Notice["status"]) {
    const res = await fetch("/api/admin/dmca", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setNotices((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status } : n)),
      );
      showToast("success", `Marked ${status}`);
    } else {
      showToast("error", "Failed to update");
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/dmca?id=${deleteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    if (res.ok) {
      setNotices((prev) => prev.filter((n) => n.id !== deleteId));
      showToast("success", "Notice deleted");
    } else {
      showToast("error", "Failed to delete");
    }
    setDeleteId(null);
  }

  const counts = {
    pending: notices.filter((n) => n.status === "pending").length,
    actioned: notices.filter((n) => n.status === "actioned").length,
    dismissed: notices.filter((n) => n.status === "dismissed").length,
  };
  const totalPages = Math.ceil(notices.length / PAGE_SIZE);
  const paginatedNotices = notices.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [notices.length]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (expanded && !paginatedNotices.some((notice) => notice.id === expanded)) {
      setExpanded(null);
    }
  }, [expanded, paginatedNotices]);

  return (
    <div className="text-white">
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
      <div className="mb-6">
        <h1 className="text-2xl font-extralight tracking-tight">
          DMCA Takedown Notices
        </h1>
        <p className="text-xs text-gray-600 mt-1">
          {notices.length} total · {counts.pending} pending · {counts.actioned} actioned ·{" "}
          {counts.dismissed} dismissed
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-600">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : notices.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl py-20 text-center">
          <p className="text-sm text-gray-500 font-light">
            No DMCA notices received
          </p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {paginatedNotices.map((n) => {
            const open = expanded === n.id;
            return (
              <div
                key={n.id}
                className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]"
              >
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(open ? null : n.id)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-light truncate">
                      {n.complainant_name}
                    </div>
                    <div className="text-[11px] text-gray-600 truncate">
                      {n.infringing_url}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-600 shrink-0 hidden sm:block">
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${STATUS_STYLE[n.status]}`}
                  >
                    {n.status}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-600 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Expanded detail */}
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] space-y-4">
                    {/* Contact */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                      <Detail icon={Mail} label="Email" value={n.complainant_email} />
                      {n.complainant_phone && (
                        <Detail icon={Phone} label="Phone" value={n.complainant_phone} />
                      )}
                      <Detail
                        icon={MapPin}
                        label="Address"
                        value={n.complainant_address}
                      />
                    </div>

                    {/* Infringing URL */}
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-gray-600 mb-1">
                        Infringing URL
                      </p>
                      <a
                        href={n.infringing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors break-all"
                      >
                        {n.infringing_url}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>

                    {/* Copyrighted work */}
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-gray-600 mb-1">
                        Copyrighted Work Claimed
                      </p>
                      <p className="text-sm text-gray-300 font-light whitespace-pre-wrap">
                        {n.copyrighted_work}
                      </p>
                    </div>

                    {/* Signature */}
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-gray-600 mb-1">
                        Electronic Signature
                      </p>
                      <p className="text-sm text-gray-300 font-light">{n.signature}</p>
                      <p className="text-[11px] text-gray-600 mt-1">
                        Good-faith &amp; accuracy statements confirmed under penalty of perjury.
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
                      <button
                        onClick={() => setStatus(n.id, "actioned")}
                        disabled={n.status === "actioned"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-light rounded-lg bg-emerald-600/80 hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Actioned
                      </button>
                      <button
                        onClick={() => setStatus(n.id, "dismissed")}
                        disabled={n.status === "dismissed"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-light rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Dismiss
                      </button>
                      {n.status !== "pending" && (
                        <button
                          onClick={() => setStatus(n.id, "pending")}
                          className="px-3 py-1.5 text-xs font-light rounded-lg text-gray-500 hover:text-white transition-colors"
                        >
                          Reset to pending
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteId(n.id)}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-light rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <AdminPagination
          currentPage={currentPage}
          totalItems={notices.length}
          totalPages={Math.max(1, totalPages)}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          itemLabel="notices"
          className="mt-4"
        />
        </>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setDeleteId(null)}
          />
          <div className="relative w-full max-w-sm bg-[#0c0c0c] border border-white/10 rounded-2xl p-6">
            <h3 className="text-base font-light mb-2">Delete this notice?</h3>
            <p className="text-sm text-gray-500 font-light mb-5">
              This permanently removes the DMCA notice record. This cannot be undone.
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

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-gray-600">
          {label}
        </p>
        <p className="text-sm text-gray-300 font-light break-words">{value}</p>
      </div>
    </div>
  );
}
