"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Flag,
  Trash,
  Warning,
  ShoppingBag,
  CheckCircle,
  Info,
  Coins,
  Sparkle,
  Lightning,
  ArrowsClockwise,
  XCircle,
} from "phosphor-react";
import { supabase } from "@/lib/supabaseClient";

type NotificationType =
  | "content_flagged"
  | "content_removed"
  | "content_blocked"
  | "report_resolved"
  | "new_sale"
  | "purchase_confirmed"
  | "royalty_earned"
  | "asset_published"
  | "credits_purchased"
  | "credits_topped_up"
  | "low_balance"
  | "topup_failed";

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

function IconFor({ type }: { type: string }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "content_flagged":
      return <Flag className={`${cls} text-amber-400`} weight="fill" />;
    case "content_removed":
      return <Trash className={`${cls} text-red-400`} weight="fill" />;
    case "content_blocked":
      return <Warning className={`${cls} text-red-400`} weight="fill" />;
    case "new_sale":
      return <ShoppingBag className={`${cls} text-emerald-400`} weight="fill" />;
    case "purchase_confirmed":
      return <CheckCircle className={`${cls} text-emerald-400`} weight="fill" />;
    case "report_resolved":
      return <Info className={`${cls} text-sky-400`} weight="fill" />;
    case "royalty_earned":
      return <Coins className={`${cls} text-amber-400`} weight="fill" />;
    case "asset_published":
      return <Sparkle className={`${cls} text-violet-400`} weight="fill" />;
    case "credits_purchased":
      return <Lightning className={`${cls} text-emerald-400`} weight="fill" />;
    case "credits_topped_up":
      return <ArrowsClockwise className={`${cls} text-emerald-400`} weight="bold" />;
    case "low_balance":
      return <Warning className={`${cls} text-amber-400`} weight="fill" />;
    case "topup_failed":
      return <XCircle className={`${cls} text-red-400`} weight="fill" />;
    default:
      return <Info className={`${cls} text-gray-400`} weight="fill" />;
  }
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  async function getToken(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function load() {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.notifications || []);
      setUnread(json.unread_count || 0);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [open]);

  async function markRead(id: string) {
    const token = await getToken();
    if (!token) return;
    // optimistic
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    const token = await getToken();
    if (!token) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // ignore
    }
  }

  function handleItemClick(n: NotificationRow) {
    if (!n.is_read) {
      markRead(n.id);
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative w-8 h-8 rounded-full bg-white/5 border flex items-center justify-center cursor-pointer transition-all duration-300 ${
          open ? "border-red-400/60" : "border-white/20 hover:border-white/40"
        }`}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-gray-300" weight="regular" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-linear-to-r from-red-500 to-red-600 text-white text-[10px] font-light flex items-center justify-center rounded-full">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <div
        className={`absolute right-0 mt-2 w-96 bg-[#0c0c0c] border border-white/10 rounded-2xl shadow-2xl text-sm transition-all duration-300 origin-top-right z-50 ${
          open
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-white font-light">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-gray-400 hover:text-white transition-colors duration-200 font-light"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[480px] overflow-y-auto" data-lenis-prevent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <Bell className="w-8 h-8 text-white/15 mb-3" weight="regular" />
              <span className="text-xs text-gray-500 font-light">
                You&apos;re all caught up
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleItemClick(n)}
                    className={`group w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-200 ${
                      n.is_read ? "hover:bg-white/[0.03]" : "bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <IconFor type={n.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[13px] font-light truncate ${
                            n.is_read ? "text-gray-300" : "text-white"
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 font-light">
                          {n.body}
                        </p>
                      )}
                      <span className="block text-[10px] text-gray-600 mt-1 font-light">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
