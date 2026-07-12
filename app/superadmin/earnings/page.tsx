"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPagination from "@/app/components/AdminPagination";
import { usePagination } from "@/app/hooks/usePagination";
import {
  ArrowsClockwise,
  User,
  Download,
  X,
  ArrowRight,
  Info,
} from "phosphor-react";

type Tx = {
  id: string;
  buyer_id: string;
  creator_id: string;
  asset_id: string | null;
  license_type_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  status: string;
  created_at: string;
};

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

type Detail = {
  tx: Tx;
  asset: { title: string | null; content_type: string | null; storage_path: string | null; thumbnail_path: string | null } | null;
  licenseType: { name: string; slug: string } | null;
  royalties: { royalty_cents: number; original_creator_id: string; status: string }[];
  originalCreators: Record<string, string>;
};

const PAGE_SIZE = 15;

export default function EarningsPage() {
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, Profile>>({});
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    const list: Tx[] = data || [];
    setTxs(list);

    const ids = new Set<string>();
    list.forEach((t) => { ids.add(t.buyer_id); ids.add(t.creator_id); });
    if (ids.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, display_name, avatar_url").in("id", Array.from(ids));
      const map: Record<string, Profile> = {};
      (profiles || []).forEach((p: Profile) => { map[p.id] = p; });
      setUsersMap(map);
    }
    setLoading(false);
  }

  async function openDetail(tx: Tx) {
    setDetailLoading(true);
    setDetail(null);

    const [assetRes, licenseRes, royaltyRes] = await Promise.all([
      tx.asset_id
        ? supabase.from("assets").select("title, content_type, storage_path, thumbnail_path").eq("id", tx.asset_id).single()
        : Promise.resolve({ data: null }),
      tx.license_type_id
        ? supabase.from("license_types").select("name, slug").eq("id", tx.license_type_id).single()
        : Promise.resolve({ data: null }),
      tx.asset_id
        ? supabase.from("royalty_payouts")
            .select("royalty_cents, original_creator_id, status")
            .eq("asset_id", tx.asset_id)
            .eq("seller_id", tx.creator_id)
            .eq("sale_price_cents", tx.amount_cents)
        : Promise.resolve({ data: [] }),
    ]);

    const royalties: Detail["royalties"] = royaltyRes.data || [];
    const creatorIds = [...new Set(royalties.map((r) => r.original_creator_id))];
    const originalCreators: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, display_name").in("id", creatorIds);
      (profiles || []).forEach((p: any) => {
        originalCreators[p.id] = p.display_name || p.id.slice(0, 8);
      });
    }

    setDetail({
      tx,
      asset: assetRes.data || null,
      licenseType: licenseRes.data || null,
      royalties,
      originalCreators,
    });
    setDetailLoading(false);
  }

  const paidTx = txs.filter((t) => t.status === "paid");
  const pendingTx = txs.filter((t) => t.status === "pending");
  const earnedFees = paidTx.reduce((s, t) => s + t.platform_fee_cents, 0) / 100;
  const pendingFees = pendingTx.reduce((s, t) => s + t.platform_fee_cents, 0) / 100;
  const grossRevenue = paidTx.reduce((s, t) => s + t.amount_cents, 0) / 100;
  const sellerPayouts = grossRevenue - earnedFees;
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination(paidTx, {
    pageSize: PAGE_SIZE,
    resetKeys: [paidTx.length],
  });

  function exportCSV() {
    const headers = ["Date", "Buyer", "Creator", "Sale Amount", "Platform Fee", "Seller Got", "Status"];
    const rows = paidTx.map((t) => [
      new Date(t.created_at).toLocaleDateString(),
      usersMap[t.buyer_id]?.display_name || t.buyer_id.slice(0, 8),
      usersMap[t.creator_id]?.display_name || t.creator_id.slice(0, 8),
      (t.amount_cents / 100).toFixed(2),
      (t.platform_fee_cents / 100).toFixed(2),
      ((t.amount_cents - t.platform_fee_cents) / 100).toFixed(2),
      t.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `earnings_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-600 text-sm">
        <ArrowsClockwise size={16} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light mb-1">Earnings</h1>
          <p className="text-sm text-gray-400">Platform fee revenue · click any row to see full breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-sm cursor-pointer transition-all">
            <ArrowsClockwise size={16} weight="bold" />
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-sm cursor-pointer transition-all">
            <Download size={16} weight="duotone" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Earned (Paid)</p>
          <p className="text-2xl font-light text-yellow-400">${earnedFees.toFixed(2)}</p>
          <p className="text-[10px] text-gray-600 mt-1">{paidTx.length} confirmed sales</p>
        </div>
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Pending Fees</p>
          <p className="text-2xl font-light text-gray-400">${pendingFees.toFixed(2)}</p>
          <p className="text-[10px] text-gray-600 mt-1">{pendingTx.length} unconfirmed</p>
        </div>
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Gross Revenue</p>
          <p className="text-2xl font-light text-white">${grossRevenue.toFixed(2)}</p>
          <p className="text-[10px] text-gray-600 mt-1">total buyer payments</p>
        </div>
        <div className="border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Seller Payouts</p>
          <p className="text-2xl font-light text-emerald-400">${sellerPayouts.toFixed(2)}</p>
          <p className="text-[10px] text-gray-600 mt-1">gross − platform fees</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 sticky top-0">
            <tr className="text-left text-gray-400">
              <th className="p-3">Buyer</th>
              <th className="p-3">Creator</th>
              <th className="p-3">Sale Amount</th>
              <th className="p-3">Platform Fee</th>
              <th className="p-3">Seller Got</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {paidTx.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">No confirmed sales yet</td>
              </tr>
            ) : (
              (paginatedItems as Tx[]).map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => openDetail(tx)}
                  className="border-t border-white/10 hover:bg-white/[0.06] transition-colors cursor-pointer group"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {usersMap[tx.buyer_id]?.avatar_url
                        ? <img src={usersMap[tx.buyer_id].avatar_url!} alt="" className="w-6 h-6 rounded-full object-cover" />
                        : <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><User size={12} className="text-gray-500" /></div>}
                      <p className="text-xs">{usersMap[tx.buyer_id]?.display_name || tx.buyer_id.slice(0, 8) + "…"}</p>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {usersMap[tx.creator_id]?.avatar_url
                        ? <img src={usersMap[tx.creator_id].avatar_url!} alt="" className="w-6 h-6 rounded-full object-cover" />
                        : <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><User size={12} className="text-gray-500" /></div>}
                      <p className="text-xs">{usersMap[tx.creator_id]?.display_name || tx.creator_id.slice(0, 8) + "…"}</p>
                    </div>
                  </td>
                  <td className="p-3 text-sm font-semibold text-white">${(tx.amount_cents / 100).toFixed(2)}</td>
                  <td className="p-3 text-sm font-semibold text-yellow-400">${(tx.platform_fee_cents / 100).toFixed(2)}</td>
                  <td className="p-3 text-sm text-emerald-400">${((tx.amount_cents - tx.platform_fee_cents) / 100).toFixed(2)}</td>
                  <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(tx.created_at).toLocaleDateString()}{" "}
                    <span className="text-gray-700">{new Date(tx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <ArrowRight size={12} className="inline ml-2 opacity-0 group-hover:opacity-40 transition-opacity" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <AdminPagination
        currentPage={currentPage}
        totalItems={totalItems}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        className="mt-4"
      />

      {/* Detail Modal */}
      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-2xl bg-[#0c0c0c] border border-white/10 rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 80px)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {detail?.asset && (() => {
                  const a = detail.asset;
                  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                  const previewPath = a.content_type === "image" ? a.storage_path : a.thumbnail_path;
                  const previewUrl = previewPath ? `${supaUrl}/storage/v1/object/public/assets/${previewPath}` : null;
                  return previewUrl ? (
                    <img src={previewUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-gray-600 capitalize">{a.content_type?.slice(0, 3)}</span>
                    </div>
                  );
                })()}
                <div className="min-w-0">
                  <h3 className="text-base font-light text-white truncate">
                    {detail?.asset?.title || "Transaction Breakdown"}
                  </h3>
                  {detail?.asset?.content_type && (
                    <p className="text-[11px] text-gray-500 mt-0.5 capitalize">{detail.asset.content_type}</p>
                  )}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-600 hover:text-white transition-colors ml-3 shrink-0">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-600 text-sm">
                <ArrowsClockwise size={16} className="animate-spin mr-2" /> Loading…
              </div>
            ) : detail && (() => {
              const { tx, licenseType, royalties } = detail;
              const totalRoyalty = royalties.reduce((s, r) => s + r.royalty_cents, 0);
              const feePercent = tx.amount_cents > 0
                ? ((tx.platform_fee_cents / tx.amount_cents) * 100).toFixed(1)
                : "0";
              const royaltyPercent = tx.amount_cents > 0 && totalRoyalty > 0
                ? ((totalRoyalty / tx.amount_cents) * 100).toFixed(1)
                : null;
              const sellerPayout = tx.amount_cents - tx.platform_fee_cents - totalRoyalty;

              return (
                <div className="p-6 space-y-5 overflow-y-auto flex-1">

                  {/* Asset preview */}
                  {detail.asset && (() => {
                    const a = detail.asset;
                    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const previewPath = a.content_type === "image" ? a.storage_path : a.thumbnail_path;
                    const previewUrl = previewPath ? `${supaUrl}/storage/v1/object/public/assets/${previewPath}` : null;
                    return previewUrl ? (
                      <div className="w-full rounded-xl overflow-hidden border border-white/10 bg-black max-h-56 flex items-center justify-center">
                        <img src={previewUrl} alt={a.title || ""} className="w-full h-full object-contain max-h-56" />
                      </div>
                    ) : null;
                  })()}

                  {/* Participants */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
                      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Buyer</p>
                      <div className="flex items-center gap-2">
                        {usersMap[tx.buyer_id]?.avatar_url
                          ? <img src={usersMap[tx.buyer_id].avatar_url!} alt="" className="w-7 h-7 rounded-full object-cover" />
                          : <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><User size={13} className="text-gray-500" /></div>}
                        <p className="text-xs text-white">{usersMap[tx.buyer_id]?.display_name || "—"}</p>
                      </div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
                      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Seller</p>
                      <div className="flex items-center gap-2">
                        {usersMap[tx.creator_id]?.avatar_url
                          ? <img src={usersMap[tx.creator_id].avatar_url!} alt="" className="w-7 h-7 rounded-full object-cover" />
                          : <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><User size={13} className="text-gray-500" /></div>}
                        <p className="text-xs text-white">{usersMap[tx.creator_id]?.display_name || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* License */}
                  {licenseType && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-600 uppercase tracking-wider">License</span>
                      <span className="px-2 py-0.5 text-xs bg-white/5 border border-white/10 text-gray-300 rounded">
                        {licenseType.name}
                      </span>
                    </div>
                  )}

                  {/* Money flow */}
                  <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="px-4 py-2 border-b border-white/[0.06]">
                      <p className="text-[10px] text-gray-600 uppercase tracking-wider">Money Flow</p>
                    </div>

                    {/* Buyer paid */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                        <span className="text-sm text-gray-300">Buyer paid</span>
                      </div>
                      <span className="text-sm font-semibold text-white">${(tx.amount_cents / 100).toFixed(2)}</span>
                    </div>

                    {/* Platform fee */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] bg-yellow-500/[0.03]">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        <span className="text-sm text-gray-300">Platform fee <span className="text-gray-600">({feePercent}%)</span></span>
                      </div>
                      <span className="text-sm font-semibold text-yellow-400">−${(tx.platform_fee_cents / 100).toFixed(2)}</span>
                    </div>

                    {/* Royalties */}
                    {royalties.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] bg-purple-500/[0.03]">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          <span className="text-sm text-gray-300">
                            Royalty to <span className="text-purple-400">{detail.originalCreators[r.original_creator_id] || "original creator"}</span>
                            {royaltyPercent && <span className="text-gray-600"> ({royaltyPercent}%)</span>}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.status === "paid" ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-500/10 text-gray-500"}`}>
                            {r.status}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-purple-400">−${(r.royalty_cents / 100).toFixed(2)}</span>
                      </div>
                    ))}

                    {/* Seller payout */}
                    <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/[0.04]">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-sm text-gray-300">Seller received</span>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400">${(sellerPayout / 100).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="space-y-1.5 text-[11px] text-gray-600">
                    <div className="flex justify-between">
                      <span>Transaction ID</span>
                      <span className="font-mono text-gray-500">{tx.id.slice(0, 16)}…</span>
                    </div>
                    {tx.stripe_payment_intent_id && (
                      <div className="flex justify-between">
                        <span>Stripe PI</span>
                        <span className="font-mono text-gray-500">{tx.stripe_payment_intent_id.slice(0, 20)}…</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Date</span>
                      <span>{new Date(tx.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {royalties.length === 0 && (
                    <div className="flex items-start gap-2 text-[11px] text-gray-600">
                      <Info size={12} className="mt-0.5 shrink-0" />
                      <span>No royalties on this sale — original purchase, not a Commercial remix resale.</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
